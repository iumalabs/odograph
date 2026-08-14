import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

// D1 storage in @cloudflare/vitest-pool-workers is isolated per test *file*, not per `it()` — each
// session below gets its own tenant, so tests never observe each other's data.

function cookieValue(setCookie: string | null): string {
  if (!setCookie) throw new Error("missing Set-Cookie header");
  return setCookie.split(";")[0] ?? "";
}

async function createSession(): Promise<{ cookie: string; tenantId: string; userId: string }> {
  const res = await SELF.fetch("https://example.com/api/v1/_dev/session", { method: "POST" });
  const body = (await res.json()) as { tenantId: string; userId: string };
  return { cookie: cookieValue(res.headers.get("set-cookie")), ...body };
}

type Vehicle = { id: string; name: string };

function createVehicleReq(
  cookie: string,
  body: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<Response> {
  return SELF.fetch("https://example.com/api/v1/vehicles", {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
}

function listVehiclesReq(cookie: string): Promise<Response> {
  return SELF.fetch("https://example.com/api/v1/vehicles", { headers: { Cookie: cookie } });
}

async function createVehicle(cookie: string, name = "Test Vehicle"): Promise<Vehicle> {
  const res = await createVehicleReq(cookie, { name, odometerUnit: "km" });
  return (await res.json()) as Vehicle;
}

type ServiceRecord = { id: string; description: string };

function createServiceRecordReq(
  cookie: string,
  vehicleId: string,
  body: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/service-records`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function createServiceRecord(cookie: string, vehicleId: string): Promise<ServiceRecord> {
  const res = await createServiceRecordReq(cookie, vehicleId, {
    serviceDate: "2026-01-01",
    description: "Oil change",
  });
  return (await res.json()) as ServiceRecord;
}

function patchServiceRecordReq(
  cookie: string,
  id: string,
  body: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/service-records/${id}`, {
    method: "PATCH",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
}

function deleteServiceRecordReq(
  cookie: string,
  id: string,
  idempotencyKey?: string,
): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/service-records/${id}`, {
    method: "DELETE",
    headers: {
      Cookie: cookie,
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
  });
}

function getServiceRecordReq(cookie: string, id: string): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/service-records/${id}`, {
    headers: { Cookie: cookie },
  });
}

function dismissServiceDuplicateReq(
  cookie: string,
  id: string,
  idempotencyKey?: string,
): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/service-records/${id}/dismiss-duplicate`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
  });
}

type FuelRecord = { id: string; volume: number; duplicateOfId: string | null };

function createFuelRecordReq(
  cookie: string,
  vehicleId: string,
  body: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/fuel-records`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function createFuelRecord(
  cookie: string,
  vehicleId: string,
  body: Record<string, unknown> = {},
): Promise<FuelRecord> {
  const res = await createFuelRecordReq(cookie, vehicleId, {
    fuelDate: "2026-01-01",
    odometerReading: 1000,
    volume: 40,
    cost: 60,
    ...body,
  });
  return (await res.json()) as FuelRecord;
}

function patchFuelRecordReq(
  cookie: string,
  id: string,
  body: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/fuel-records/${id}`, {
    method: "PATCH",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
}

function deleteFuelRecordReq(
  cookie: string,
  id: string,
  idempotencyKey?: string,
): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/fuel-records/${id}`, {
    method: "DELETE",
    headers: {
      Cookie: cookie,
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
  });
}

function dismissFuelDuplicateReq(
  cookie: string,
  id: string,
  idempotencyKey?: string,
): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/fuel-records/${id}/dismiss-duplicate`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
  });
}

type VehicleDocument = { id: string; title: string };

function createDocumentReq(
  cookie: string,
  vehicleId: string,
  body: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/documents`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function createDocument(cookie: string, vehicleId: string): Promise<VehicleDocument> {
  const res = await createDocumentReq(cookie, vehicleId, {
    title: "Registration",
    category: "registration",
  });
  return (await res.json()) as VehicleDocument;
}

function patchDocumentReq(
  cookie: string,
  id: string,
  body: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/documents/${id}`, {
    method: "PATCH",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
}

function deleteDocumentReq(cookie: string, id: string, idempotencyKey?: string): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/documents/${id}`, {
    method: "DELETE",
    headers: {
      Cookie: cookie,
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
  });
}

type PlanCard = { id: string; title: string };

function createPlanCardReq(
  cookie: string,
  vehicleId: string,
  body: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/plan-cards`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function createPlanCard(cookie: string, vehicleId: string): Promise<PlanCard> {
  const res = await createPlanCardReq(cookie, vehicleId, { title: "Replace brakes" });
  return (await res.json()) as PlanCard;
}

function patchPlanCardReq(
  cookie: string,
  id: string,
  body: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/plan-cards/${id}`, {
    method: "PATCH",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
}

function deletePlanCardReq(cookie: string, id: string, idempotencyKey?: string): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/plan-cards/${id}`, {
    method: "DELETE",
    headers: {
      Cookie: cookie,
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
  });
}

type ReminderRule = { id: string; label: string };

function createReminderRuleReq(
  cookie: string,
  vehicleId: string,
  body: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/reminder-rules`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function createReminderRule(cookie: string, vehicleId: string): Promise<ReminderRule> {
  const res = await createReminderRuleReq(cookie, vehicleId, {
    label: "Oil change",
    intervalDays: 180,
    lastDoneDate: "2026-01-01",
  });
  return (await res.json()) as ReminderRule;
}

function deleteReminderRuleReq(
  cookie: string,
  id: string,
  idempotencyKey?: string,
): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/reminder-rules/${id}`, {
    method: "DELETE",
    headers: {
      Cookie: cookie,
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
  });
}

describe("idempotency — replay returns the stored response without re-executing", () => {
  it("a repeated Idempotency-Key on create-vehicle returns the same response and creates only one row", async () => {
    const { cookie } = await createSession();
    const key = crypto.randomUUID();

    const first = await createVehicleReq(cookie, { name: "Once", odometerUnit: "km" }, key);
    expect(first.status).toBe(201);
    const firstBody = await first.json();

    const second = await createVehicleReq(cookie, { name: "Once", odometerUnit: "km" }, key);
    expect(second.status).toBe(201);
    const secondBody = await second.json();
    expect(secondBody).toEqual(firstBody);

    const list = await listVehiclesReq(cookie);
    const { vehicles } = (await list.json()) as { vehicles: Vehicle[] };
    expect(vehicles.length).toBe(1);
  });

  it("a repeated Idempotency-Key returns the ORIGINAL response even if the request body differs the second time", async () => {
    const { cookie } = await createSession();
    const key = crypto.randomUUID();

    const first = await createVehicleReq(cookie, { name: "First Name", odometerUnit: "km" }, key);
    const firstBody = await first.json();

    const second = await createVehicleReq(
      cookie,
      { name: "Different Name", odometerUnit: "mi" },
      key,
    );
    const secondBody = await second.json();
    expect(secondBody).toEqual(firstBody);

    const list = await listVehiclesReq(cookie);
    const { vehicles } = (await list.json()) as { vehicles: Vehicle[] };
    expect(vehicles.length).toBe(1);
    expect(vehicles[0]?.name).toBe("First Name");
  });

  it("the same Idempotency-Key under a different tenant is not short-circuited", async () => {
    const key = crypto.randomUUID();
    const a = await createSession();
    const b = await createSession();

    const resA = await createVehicleReq(a.cookie, { name: "Tenant A", odometerUnit: "km" }, key);
    const resB = await createVehicleReq(b.cookie, { name: "Tenant B", odometerUnit: "km" }, key);
    expect(resA.status).toBe(201);
    expect(resB.status).toBe(201);

    const bodyA = (await resA.json()) as Vehicle;
    const bodyB = (await resB.json()) as Vehicle;
    expect(bodyA.id).not.toBe(bodyB.id);
    expect(bodyB.name).toBe("Tenant B");
  });

  it("no Idempotency-Key header behaves exactly as before this feature — two identical creates make two rows", async () => {
    const { cookie } = await createSession();

    const first = await createVehicleReq(cookie, { name: "Dup", odometerUnit: "km" });
    const second = await createVehicleReq(cookie, { name: "Dup", odometerUnit: "km" });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const list = await listVehiclesReq(cookie);
    const { vehicles } = (await list.json()) as { vehicles: Vehicle[] };
    expect(vehicles.length).toBe(2);
  });

  it("applies beyond create: a repeated Idempotency-Key on a service-record PATCH is not re-applied", async () => {
    const { cookie } = await createSession();
    const vehicle = await createVehicle(cookie, "Owner");
    const record = await createServiceRecord(cookie, vehicle.id);
    const key = crypto.randomUUID();

    const first = await patchServiceRecordReq(
      cookie,
      record.id,
      { description: "Renamed Once" },
      key,
    );
    expect(first.status).toBe(200);

    // Same key, different body — proves the handler did not run a second time.
    const second = await patchServiceRecordReq(
      cookie,
      record.id,
      { description: "Renamed Twice" },
      key,
    );
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as ServiceRecord;
    expect(secondBody.description).toBe("Renamed Once");
  });

  it("a key reused across two different routes does not short-circuit the second with the first's response (test-coverage audit finding)", async () => {
    const { cookie } = await createSession();
    const vehicle = await createVehicle(cookie, "Owner");
    const record = await createServiceRecord(cookie, vehicle.id);
    const key = crypto.randomUUID();

    // First use: create-vehicle. Stores a 201 vehicle response under (tenant, POST /vehicles, key).
    const first = await createVehicleReq(cookie, { name: "Reused Key", odometerUnit: "km" }, key);
    expect(first.status).toBe(201);

    // Second use: the SAME key on a completely different route (PATCH a service record). Before
    // scoping the ledger by method+path, this incorrectly returned the first call's cached 201
    // vehicle body instead of ever running the PATCH.
    const second = await patchServiceRecordReq(
      cookie,
      record.id,
      { description: "Actually Renamed" },
      key,
    );
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as ServiceRecord;
    expect(secondBody.description).toBe("Actually Renamed");

    // The PATCH genuinely ran and persisted — not just a coincidentally-shaped cached response.
    const refetched =
      (await (await getServiceRecordReq(cookie, record.id)).json()) as ServiceRecord;
    expect(refetched.description).toBe("Actually Renamed");
  });

  it("a repeated Idempotency-Key on delete-service-record returns the cached 204 without a second deletion attempt", async () => {
    const { cookie } = await createSession();
    const vehicle = await createVehicle(cookie, "Owner");
    const record = await createServiceRecord(cookie, vehicle.id);
    const key = crypto.randomUUID();

    const first = await deleteServiceRecordReq(cookie, record.id, key);
    expect(first.status).toBe(204);

    // Without idempotency short-circuiting this, the handler would run again, find the row
    // already gone, and return 404 instead of the expected replayed 204.
    const second = await deleteServiceRecordReq(cookie, record.id, key);
    expect(second.status).toBe(204);
  });

  it("a 400 (invalid request) is stored and replayed, not silently re-validated", async () => {
    const { cookie } = await createSession();
    const key = crypto.randomUUID();

    const first = await createVehicleReq(cookie, { name: "", odometerUnit: "km" }, key);
    expect(first.status).toBe(400);

    const second = await createVehicleReq(cookie, { name: "", odometerUnit: "km" }, key);
    expect(second.status).toBe(400);
    expect(await second.text()).toBe(await first.clone().text());

    const list = await listVehiclesReq(cookie);
    const { vehicles } = (await list.json()) as { vehicles: Vehicle[] };
    expect(vehicles.length).toBe(0);
  });
});

// Replay coverage for every remaining route wearing the `idempotent` middleware
// (test-coverage audit follow-up) — the describe block above only covered create-vehicle and
// service-record PATCH/DELETE/dismiss-duplicate. `reminder-rules.test.ts` already covers
// POST /:id/mark-done's idempotent retry (spec 049) — not duplicated here.
describe("idempotency — replay coverage for the remaining create routes", () => {
  it("POST /vehicles/:id/service-records: a repeated key creates only one record", async () => {
    const { cookie } = await createSession();
    const vehicle = await createVehicle(cookie, "Owner");
    const key = crypto.randomUUID();

    const first = await createServiceRecordReq(cookie, vehicle.id, {
      serviceDate: "2026-01-01",
      description: "Oil change",
    }, key);
    const firstBody = await first.json();

    const second = await createServiceRecordReq(cookie, vehicle.id, {
      serviceDate: "2026-02-01",
      description: "Brake pads",
    }, key);
    expect(await second.json()).toEqual(firstBody);
  });

  it("POST /vehicles/:id/fuel-records: a repeated key creates only one record", async () => {
    const { cookie } = await createSession();
    const vehicle = await createVehicle(cookie, "Owner");
    const key = crypto.randomUUID();

    const first = await createFuelRecordReq(cookie, vehicle.id, {
      fuelDate: "2026-01-01",
      odometerReading: 1000,
      volume: 40,
      cost: 60,
    }, key);
    const firstBody = await first.json();

    const second = await createFuelRecordReq(cookie, vehicle.id, {
      fuelDate: "2026-02-01",
      odometerReading: 2000,
      volume: 50,
      cost: 70,
    }, key);
    expect(await second.json()).toEqual(firstBody);
  });

  it("POST /vehicles/:id/documents: a repeated key creates only one record", async () => {
    const { cookie } = await createSession();
    const vehicle = await createVehicle(cookie, "Owner");
    const key = crypto.randomUUID();

    const first = await createDocumentReq(cookie, vehicle.id, {
      title: "Registration",
      category: "registration",
    }, key);
    const firstBody = await first.json();

    const second = await createDocumentReq(cookie, vehicle.id, {
      title: "Insurance",
      category: "insurance",
    }, key);
    expect(await second.json()).toEqual(firstBody);
  });

  it("POST /vehicles/:id/plan-cards: a repeated key creates only one record", async () => {
    const { cookie } = await createSession();
    const vehicle = await createVehicle(cookie, "Owner");
    const key = crypto.randomUUID();

    const first = await createPlanCardReq(cookie, vehicle.id, { title: "Replace brakes" }, key);
    const firstBody = await first.json();

    const second = await createPlanCardReq(cookie, vehicle.id, { title: "Replace tires" }, key);
    expect(await second.json()).toEqual(firstBody);
  });

  it("POST /vehicles/:id/reminder-rules: a repeated key creates only one record", async () => {
    const { cookie } = await createSession();
    const vehicle = await createVehicle(cookie, "Owner");
    const key = crypto.randomUUID();

    const first = await createReminderRuleReq(cookie, vehicle.id, {
      label: "Oil change",
      intervalDays: 180,
      lastDoneDate: "2026-01-01",
    }, key);
    const firstBody = await first.json();

    const second = await createReminderRuleReq(cookie, vehicle.id, {
      label: "Tire rotation",
      intervalDays: 90,
      lastDoneDate: "2026-01-01",
    }, key);
    expect(await second.json()).toEqual(firstBody);
  });
});

describe("idempotency — replay coverage for the remaining PATCH routes", () => {
  it("PATCH /fuel-records/:id: a repeated key does not re-apply the second call's body", async () => {
    const { cookie } = await createSession();
    const vehicle = await createVehicle(cookie, "Owner");
    const record = await createFuelRecord(cookie, vehicle.id);
    const key = crypto.randomUUID();

    const first = await patchFuelRecordReq(cookie, record.id, { station: "Shell" }, key);
    expect(first.status).toBe(200);

    const second = await patchFuelRecordReq(cookie, record.id, { station: "Chevron" }, key);
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { station: string | null };
    expect(secondBody.station).toBe("Shell");
  });

  it("PATCH /documents/:id: a repeated key does not re-apply the second call's body", async () => {
    const { cookie } = await createSession();
    const vehicle = await createVehicle(cookie, "Owner");
    const document = await createDocument(cookie, vehicle.id);
    const key = crypto.randomUUID();

    const first = await patchDocumentReq(cookie, document.id, { title: "Renamed Once" }, key);
    expect(first.status).toBe(200);

    const second = await patchDocumentReq(cookie, document.id, { title: "Renamed Twice" }, key);
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as VehicleDocument;
    expect(secondBody.title).toBe("Renamed Once");
  });

  it("PATCH /plan-cards/:id: a repeated key does not re-apply the second call's body", async () => {
    const { cookie } = await createSession();
    const vehicle = await createVehicle(cookie, "Owner");
    const card = await createPlanCard(cookie, vehicle.id);
    const key = crypto.randomUUID();

    const first = await patchPlanCardReq(cookie, card.id, { title: "Renamed Once" }, key);
    expect(first.status).toBe(200);

    const second = await patchPlanCardReq(cookie, card.id, { title: "Renamed Twice" }, key);
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as PlanCard;
    expect(secondBody.title).toBe("Renamed Once");
  });
});

describe("idempotency — replay coverage for the remaining DELETE routes", () => {
  it("DELETE /fuel-records/:id: a repeated key returns the cached 204, not a second-delete 404", async () => {
    const { cookie } = await createSession();
    const vehicle = await createVehicle(cookie, "Owner");
    const record = await createFuelRecord(cookie, vehicle.id);
    const key = crypto.randomUUID();

    const first = await deleteFuelRecordReq(cookie, record.id, key);
    expect(first.status).toBe(204);

    const second = await deleteFuelRecordReq(cookie, record.id, key);
    expect(second.status).toBe(204);
  });

  it("DELETE /documents/:id: a repeated key returns the cached 204, not a second-delete 404", async () => {
    const { cookie } = await createSession();
    const vehicle = await createVehicle(cookie, "Owner");
    const document = await createDocument(cookie, vehicle.id);
    const key = crypto.randomUUID();

    const first = await deleteDocumentReq(cookie, document.id, key);
    expect(first.status).toBe(204);

    const second = await deleteDocumentReq(cookie, document.id, key);
    expect(second.status).toBe(204);
  });

  it("DELETE /plan-cards/:id: a repeated key returns the cached 204, not a second-delete 404", async () => {
    const { cookie } = await createSession();
    const vehicle = await createVehicle(cookie, "Owner");
    const card = await createPlanCard(cookie, vehicle.id);
    const key = crypto.randomUUID();

    const first = await deletePlanCardReq(cookie, card.id, key);
    expect(first.status).toBe(204);

    const second = await deletePlanCardReq(cookie, card.id, key);
    expect(second.status).toBe(204);
  });

  it("DELETE /reminder-rules/:id: a repeated key returns the cached 204, not a second-delete 404", async () => {
    const { cookie } = await createSession();
    const vehicle = await createVehicle(cookie, "Owner");
    const rule = await createReminderRule(cookie, vehicle.id);
    const key = crypto.randomUUID();

    const first = await deleteReminderRuleReq(cookie, rule.id, key);
    expect(first.status).toBe(204);

    const second = await deleteReminderRuleReq(cookie, rule.id, key);
    expect(second.status).toBe(204);
  });
});

describe("idempotency — replay coverage for dismiss-duplicate routes", () => {
  it("POST /service-records/:id/dismiss-duplicate: a repeated key returns the cached 200, not a second-dismiss 404", async () => {
    const { cookie } = await createSession();
    const vehicle = await createVehicle(cookie, "Owner");
    const original = await createServiceRecord(cookie, vehicle.id);
    // Same date + same description (case-insensitive) flags this one as a duplicate of `original`
    // (constitution D-005).
    const duplicate = (await (await createServiceRecordReq(cookie, vehicle.id, {
      serviceDate: "2026-01-01",
      description: "Oil change",
    })).json()) as { id: string; duplicateOfId: string | null };
    expect(duplicate.duplicateOfId).toBe(original.id);

    const key = crypto.randomUUID();
    const first = await dismissServiceDuplicateReq(cookie, duplicate.id, key);
    expect(first.status).toBe(200);

    // Without the idempotent short-circuit, a second real execution would find duplicateOfId
    // already NULL and 404 instead of replaying the cached 200.
    const second = await dismissServiceDuplicateReq(cookie, duplicate.id, key);
    expect(second.status).toBe(200);
  });

  it("POST /fuel-records/:id/dismiss-duplicate: a repeated key returns the cached 200, not a second-dismiss 404", async () => {
    const { cookie } = await createSession();
    const vehicle = await createVehicle(cookie, "Owner");
    const original = await createFuelRecord(cookie, vehicle.id, {
      fuelDate: "2026-01-01",
      odometerReading: 5000,
      volume: 40,
      cost: 60,
    });
    // Same date + odometer within the fuel duplicate-detection tolerance (5) flags this one
    // against `original` (constitution D-005).
    const duplicate = await createFuelRecord(cookie, vehicle.id, {
      fuelDate: "2026-01-01",
      odometerReading: 5002,
      volume: 1,
      cost: 999,
    });
    expect(duplicate.duplicateOfId).toBe(original.id);

    const key = crypto.randomUUID();
    const first = await dismissFuelDuplicateReq(cookie, duplicate.id, key);
    expect(first.status).toBe(200);

    const second = await dismissFuelDuplicateReq(cookie, duplicate.id, key);
    expect(second.status).toBe(200);
  });
});

describe("idempotency — client-supplied id on create (spec 020 FR-007)", () => {
  it("honors a syntactically valid client-supplied id", async () => {
    const { cookie } = await createSession();
    const clientId = crypto.randomUUID();

    const res = await createVehicleReq(cookie, {
      id: clientId,
      name: "Client Id",
      odometerUnit: "km",
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as Vehicle;
    expect(body.id).toBe(clientId);
  });

  it("rejects a malformed client-supplied id with 400 and creates nothing", async () => {
    const { cookie } = await createSession();

    const res = await createVehicleReq(cookie, {
      id: "not-a-uuid",
      name: "Bad Id",
      odometerUnit: "km",
    });
    expect(res.status).toBe(400);

    const list = await listVehiclesReq(cookie);
    const { vehicles } = (await list.json()) as { vehicles: Vehicle[] };
    expect(vehicles.length).toBe(0);
  });

  it("generates a server id when none is supplied, unchanged from before this feature", async () => {
    const { cookie } = await createSession();

    const res = await createVehicleReq(cookie, { name: "No Id", odometerUnit: "km" });
    expect(res.status).toBe(201);
    const body = (await res.json()) as Vehicle;
    expect(typeof body.id).toBe("string");
    expect(body.id.length).toBeGreaterThan(0);
  });
});
type VehiclePhoto = { id: string; category: string };

function createVehiclePhotoReq(
  cookie: string,
  vehicleId: string,
  body: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/photos`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function createVehiclePhoto(cookie: string, vehicleId: string): Promise<VehiclePhoto> {
  const res = await createVehiclePhotoReq(cookie, vehicleId, { category: "general" });
  return (await res.json()) as VehiclePhoto;
}

function patchVehiclePhotoReq(
  cookie: string,
  id: string,
  body: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicle-photos/${id}`, {
    method: "PATCH",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });
}

function deleteVehiclePhotoReq(
  cookie: string,
  id: string,
  idempotencyKey?: string,
): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicle-photos/${id}`, {
    method: "DELETE",
    headers: {
      Cookie: cookie,
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
  });
}

it("POST /vehicles/:id/photos: a repeated key creates only one (still-imageless) tile", async () => {
  const { cookie } = await createSession();
  const vehicle = await createVehicle(cookie, "Owner");
  const key = crypto.randomUUID();

  const first = await createVehiclePhotoReq(cookie, vehicle.id, { category: "general" }, key);
  const firstBody = await first.json();

  const second = await createVehiclePhotoReq(cookie, vehicle.id, { category: "damage" }, key);
  expect(await second.json()).toEqual(firstBody);
});

it("PATCH /vehicle-photos/:id: a repeated key does not re-apply the second call's body", async () => {
  const { cookie } = await createSession();
  const vehicle = await createVehicle(cookie, "Owner");
  const photo = await createVehiclePhoto(cookie, vehicle.id);
  const key = crypto.randomUUID();

  const first = await patchVehiclePhotoReq(cookie, photo.id, { caption: "First" }, key);
  expect(first.status).toBe(200);

  const second = await patchVehiclePhotoReq(cookie, photo.id, { caption: "Second" }, key);
  expect(second.status).toBe(200);
  const secondBody = (await second.json()) as { caption: string | null };
  expect(secondBody.caption).toBe("First");
});

it("DELETE /vehicle-photos/:id: a repeated key returns the cached 204, not a second-delete 404", async () => {
  const { cookie } = await createSession();
  const vehicle = await createVehicle(cookie, "Owner");
  const photo = await createVehiclePhoto(cookie, vehicle.id);
  const key = crypto.randomUUID();

  const first = await deleteVehiclePhotoReq(cookie, photo.id, key);
  expect(first.status).toBe(204);

  const second = await deleteVehiclePhotoReq(cookie, photo.id, key);
  expect(second.status).toBe(204);
});
