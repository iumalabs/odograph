import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

function cookieValue(setCookie: string | null): string {
  if (!setCookie) throw new Error("missing Set-Cookie header");
  return setCookie.split(";")[0] ?? "";
}

// A fresh session per test (rather than one shared across the whole file) — this suite's
// createVehicle/createServiceRecord/createReminderRule/accept calls are all rate-limited
// (rateLimitBySession, 30/60s), and sharing one session across this many `it` blocks would trip
// that limit well before the file finishes (mirrors createDeliverableSession's per-test session in
// reminder-rules.test.ts, just applied to every test here since this file is POST-heavy).
async function createSession(): Promise<string> {
  const res = await SELF.fetch("https://example.com/api/v1/_dev/session", { method: "POST" });
  return cookieValue(res.headers.get("set-cookie"));
}

type VehicleBody = { name?: unknown; odometerUnit?: unknown };

async function createVehicleId(cookie: string, body: VehicleBody = {}): Promise<string> {
  const res = await SELF.fetch("https://example.com/api/v1/vehicles", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Test Vehicle", odometerUnit: "km", ...body }),
  });
  const created = (await res.json()) as { id: string };
  return created.id;
}

type ServiceRecordBody = {
  serviceDate?: unknown;
  description?: unknown;
  odometerReading?: unknown;
  cost?: unknown;
  notes?: unknown;
  performedBy?: unknown;
};

async function createServiceRecord(
  cookie: string,
  vehicleId: string,
  body: ServiceRecordBody,
): Promise<{ id: string; duplicateOfId: string | null }> {
  const res = await SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/service-records`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

function getEstimate(cookie: string, vehicleId: string): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/service-due-estimate`, {
    headers: { Cookie: cookie },
  });
}

function acceptEstimate(
  cookie: string,
  vehicleId: string,
  description: string,
  idempotencyKey?: string,
): Promise<Response> {
  return SELF.fetch(
    `https://example.com/api/v1/vehicles/${vehicleId}/service-due-estimate/accept`,
    {
      method: "POST",
      headers: idempotencyKey
        ? { Cookie: cookie, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey }
        : { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
    },
  );
}

type ReminderRuleBody = {
  label?: unknown;
  intervalDays?: unknown;
  intervalDistance?: unknown;
  lastDoneDate?: unknown;
  lastDoneOdometer?: unknown;
};

function createReminderRule(
  cookie: string,
  vehicleId: string,
  body: ReminderRuleBody,
): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/reminder-rules`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

type ReminderRuleSummary = {
  id: string;
  label: string;
  intervalDays: number | null;
  intervalDistance: number | null;
  lastDoneDate: string | null;
  lastDoneOdometer: number | null;
};

async function listReminderRules(
  cookie: string,
  vehicleId: string,
): Promise<ReminderRuleSummary[]> {
  const res = await SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/reminder-rules`, {
    headers: { Cookie: cookie },
  });
  const body = (await res.json()) as { reminderRules: ReminderRuleSummary[] };
  return body.reminderRules;
}

type Estimate = {
  description: string;
  estimatedOdometer: number;
  averageInterval: number;
  basedOnRecordCount: number;
} | null;

describe("service due estimate: history-based recurring-work estimate (spec 053)", () => {
  it("returns {estimate: null} for a vehicle with zero service records", async () => {
    const cookie = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const res = await getEstimate(cookie, vehicleId);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ estimate: null });
  });

  it("returns {estimate: null} for a vehicle with exactly one matching record", async () => {
    const cookie = await createSession();
    const vehicleId = await createVehicleId(cookie);
    await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-01-01",
      description: "Oil change",
      odometerReading: 10_000,
    });
    const res = await getEstimate(cookie, vehicleId);
    expect((await res.json()) as { estimate: Estimate }).toEqual({ estimate: null });
  });

  it("computes estimatedOdometer/averageInterval/basedOnRecordCount from two matching records", async () => {
    const cookie = await createSession();
    const vehicleId = await createVehicleId(cookie);
    await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-01-01",
      description: "Oil change",
      odometerReading: 10_000,
    });
    await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-06-01",
      description: "Oil change",
      odometerReading: 15_000,
    });

    const res = await getEstimate(cookie, vehicleId);
    expect(res.status).toBe(200);
    const { estimate } = (await res.json()) as { estimate: Estimate };
    expect(estimate).toEqual({
      description: "Oil change",
      estimatedOdometer: 20_000,
      averageInterval: 5_000,
      basedOnRecordCount: 2,
    });
  });

  it("averages across all consecutive pairs once a third matching record exists (not just the most recent gap)", async () => {
    const cookie = await createSession();
    const vehicleId = await createVehicleId(cookie);
    await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-01-01",
      description: "Oil change",
      odometerReading: 10_000,
    });
    await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-04-01",
      description: "Oil change",
      odometerReading: 15_000,
    });
    await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-07-01",
      description: "Oil change",
      odometerReading: 25_000,
    });

    const res = await getEstimate(cookie, vehicleId);
    const { estimate } = (await res.json()) as { estimate: Estimate };
    // Gaps: 5000, 10000 -> average 7500; estimated = 25000 (most recent) + 7500.
    expect(estimate).toEqual({
      description: "Oil change",
      estimatedOdometer: 32_500,
      averageInterval: 7_500,
      basedOnRecordCount: 3,
    });
  });

  it("surfaces only the single soonest-due estimate when two work groups both qualify", async () => {
    const cookie = await createSession();
    const vehicleId = await createVehicleId(cookie);
    // Oil change: due at 30000 + 5000 = 35000.
    await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-01-01",
      description: "Oil change",
      odometerReading: 25_000,
    });
    await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-06-01",
      description: "Oil change",
      odometerReading: 30_000,
    });
    // Brake pads: due at 30500 + 1000 = 31500 (nearer).
    await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-02-01",
      description: "Brake pads",
      odometerReading: 29_500,
    });
    await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-07-01",
      description: "Brake pads",
      odometerReading: 30_500,
    });

    const res = await getEstimate(cookie, vehicleId);
    const { estimate } = (await res.json()) as { estimate: Estimate };
    expect(estimate?.description).toBe("Brake pads");
    expect(estimate?.estimatedOdometer).toBe(31_500);
  });

  it("suppresses the estimate once an explicit reminder rule matches its (normalized) description", async () => {
    const cookie = await createSession();
    const vehicleId = await createVehicleId(cookie);
    await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-01-01",
      description: "Timing belt",
      odometerReading: 40_000,
    });
    await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-06-01",
      description: "Timing belt",
      odometerReading: 44_000,
    });
    const before = await getEstimate(cookie, vehicleId);
    expect(((await before.json()) as { estimate: Estimate }).estimate?.description).toBe(
      "Timing belt",
    );

    await createReminderRule(cookie, vehicleId, {
      label: "  TIMING BELT  ", // case/whitespace-normalized match (FR-001/FR-006)
      intervalDistance: 4_000,
      lastDoneOdometer: 44_000,
    });

    const after = await getEstimate(cookie, vehicleId);
    expect((await after.json()) as { estimate: Estimate }).toEqual({ estimate: null });
  });

  it("accepting an estimate creates a matching reminder rule, readable via GET /reminder-rules", async () => {
    const cookie = await createSession();
    const vehicleId = await createVehicleId(cookie);
    await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-01-01",
      description: "Air filter",
      odometerReading: 5_000,
    });
    await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-06-01",
      description: "Air filter",
      odometerReading: 8_000,
    });

    const res = await acceptEstimate(cookie, vehicleId, "Air filter", crypto.randomUUID());
    expect(res.status).toBe(201);
    const created = (await res.json()) as ReminderRuleSummary;
    expect(created.label).toBe("Air filter");
    expect(created.intervalDays).toBeNull();
    expect(created.intervalDistance).toBe(3_000);
    expect(created.lastDoneOdometer).toBe(8_000);
    expect(created.lastDoneDate).toBe("2026-06-01");

    const rules = await listReminderRules(cookie, vehicleId);
    expect(rules.some((r) => r.id === created.id)).toBe(true);

    // FR-006/scenario 6's suppression now applies to the just-accepted work.
    const after = await getEstimate(cookie, vehicleId);
    expect((await after.json()) as { estimate: Estimate }).toEqual({ estimate: null });
  });

  it("retrying the same accept request (same Idempotency-Key) creates exactly one reminder rule", async () => {
    const cookie = await createSession();
    const vehicleId = await createVehicleId(cookie);
    await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-01-01",
      description: "Cabin filter",
      odometerReading: 1_000,
    });
    await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-06-01",
      description: "Cabin filter",
      odometerReading: 2_000,
    });

    const key = crypto.randomUUID();
    const first = await acceptEstimate(cookie, vehicleId, "Cabin filter", key);
    const second = await acceptEstimate(cookie, vehicleId, "Cabin filter", key);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect((await first.json() as { id: string }).id).toBe(
      (await second.json() as { id: string }).id,
    );

    const rules = await listReminderRules(cookie, vehicleId);
    expect(rules.filter((r) => r.label === "Cabin filter").length).toBe(1);
  });

  it("returns 409 no_longer_available when accepting a description with no currently-qualifying estimate", async () => {
    const cookie = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const res = await acceptEstimate(cookie, vehicleId, "Nonexistent work", crypto.randomUUID());
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "no_longer_available" });
  });

  it("returns 409 accepting the same description a second time (already taken) with a different idempotency key", async () => {
    const cookie = await createSession();
    const vehicleId = await createVehicleId(cookie);
    await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-01-01",
      description: "Spark plugs",
      odometerReading: 1_000,
    });
    await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-06-01",
      description: "Spark plugs",
      odometerReading: 3_000,
    });

    const first = await acceptEstimate(cookie, vehicleId, "Spark plugs", crypto.randomUUID());
    expect(first.status).toBe(201);

    const second = await acceptEstimate(cookie, vehicleId, "Spark plugs", crypto.randomUUID());
    expect(second.status).toBe(409);
  });

  it("returns 404 for an unknown vehicle on both routes", async () => {
    const cookie = await createSession();
    const unknown = "00000000-0000-0000-0000-000000000000";
    const getRes = await getEstimate(cookie, unknown);
    expect(getRes.status).toBe(404);

    const acceptRes = await acceptEstimate(cookie, unknown, "Anything", crypto.randomUUID());
    expect(acceptRes.status).toBe(404);
  });

  it("returns 404 for a vehicle belonging to a different tenant", async () => {
    const cookie = await createSession();
    const otherCookie = await createSession();
    const vehicleId = await createVehicleId(otherCookie);

    const getRes = await getEstimate(cookie, vehicleId);
    expect(getRes.status).toBe(404);

    const acceptRes = await acceptEstimate(cookie, vehicleId, "Anything", crypto.randomUUID());
    expect(acceptRes.status).toBe(404);
  });

  it("excludes duplicate-flagged records and null-odometer records from the grouping", async () => {
    const cookie = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const first = await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-01-01",
      description: "Wiper blades",
      odometerReading: 12_000,
    });
    expect(first.duplicateOfId).toBeNull();
    // Same date + same description => flagged as a semantic duplicate of `first` (constitution
    // D-005) and must not count toward the >=2-record threshold.
    const duplicate = await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-01-01",
      description: "Wiper blades",
      odometerReading: 12_050,
    });
    expect(duplicate.duplicateOfId).toBe(first.id);
    // No odometer reading — nothing to measure distance from.
    await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-03-01",
      description: "Wiper blades",
    });

    const res = await getEstimate(cookie, vehicleId);
    expect((await res.json()) as { estimate: Estimate }).toEqual({ estimate: null });
  });

  it("a zero-distance pair contributes no usable interval; the sole pair being zero yields no estimate", async () => {
    const cookie = await createSession();
    const vehicleId = await createVehicleId(cookie);
    await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-01-01",
      description: "Tire rotation",
      odometerReading: 9_000,
    });
    await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-02-01",
      description: "Tire rotation",
      odometerReading: 9_000,
    });

    const res = await getEstimate(cookie, vehicleId);
    expect((await res.json()) as { estimate: Estimate }).toEqual({ estimate: null });
  });
});
