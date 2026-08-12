import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

function cookieValue(setCookie: string | null): string {
  if (!setCookie) throw new Error("missing Set-Cookie header");
  return setCookie.split(";")[0] ?? "";
}

async function createSession(): Promise<{ cookie: string; tenantId: string }> {
  const res = await SELF.fetch("https://example.com/api/v1/_dev/session", { method: "POST" });
  const body = (await res.json()) as { tenantId: string };
  return { cookie: cookieValue(res.headers.get("set-cookie")), tenantId: body.tenantId };
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

type FuelRecordBody = {
  fuelDate?: unknown;
  odometerReading?: unknown;
  volume?: unknown;
  cost?: unknown;
  station?: unknown;
  notes?: unknown;
};

function createFuelRecord(
  cookie: string,
  vehicleId: string,
  body: FuelRecordBody,
): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/fuel-records`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteFuelRecordReq(cookie: string, id: string): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/fuel-records/${id}`, {
    method: "DELETE",
    headers: { Cookie: cookie },
  });
}

type ServiceRecordBody = {
  serviceDate?: unknown;
  description?: unknown;
  odometerReading?: unknown;
  cost?: unknown;
  notes?: unknown;
};

function createServiceRecord(
  cookie: string,
  vehicleId: string,
  body: ServiceRecordBody,
): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/service-records`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getAggregates(cookie: string, vehicleId: string): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/aggregates`, {
    headers: { Cookie: cookie },
  });
}

function getExpenseBreakdown(
  cookie: string,
  vehicleId: string,
  groupBy?: string,
): Promise<Response> {
  const query = groupBy !== undefined ? `?groupBy=${groupBy}` : "";
  return SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/expense-breakdown${query}`, {
    headers: { Cookie: cookie },
  });
}

type ExpensePeriod = {
  period: string;
  maintenanceCost: number;
  fuelCost: number;
  totalCost: number;
};

type Aggregates = {
  costPerDistance: number | null;
  costPerTime: number | null;
  averageFuelEconomy: number | null;
  currentOdometer: number | null;
};

describe("vehicle aggregates: costPerDistance / costPerTime (spec 013, US1)", () => {
  // Rate-limited session creation (30/window/IP) is shared across every request in this file's
  // single execution window, so these tests share one session and use a fresh vehicle per test
  // (cheap, unlimited) to avoid cross-test duplicate-detection pollution — same convention
  // fuel-record-crud.test.ts's duplicate-detection describe block already established.
  let sharedCookie: string;

  beforeAll(async () => {
    sharedCookie = (await createSession()).cookie;
  });

  it("combines service + fuel cost and spans into one costPerDistance/costPerTime", async () => {
    const vehicleId = await createVehicleId(sharedCookie);

    await createServiceRecord(sharedCookie, vehicleId, {
      serviceDate: "2026-01-01",
      description: "Inspection",
      odometerReading: 1000,
      cost: 50,
    });
    await createFuelRecord(sharedCookie, vehicleId, {
      fuelDate: "2026-01-11",
      odometerReading: 1100,
      volume: 40,
      cost: 60,
    });

    const res = await getAggregates(sharedCookie, vehicleId);
    expect(res.status).toBe(200);
    const aggregates = (await res.json()) as Aggregates;
    // totalCost 50+60=110, distance span 1100-1000=100, day span 10.
    expect(aggregates.costPerDistance).toBeCloseTo(1.1, 5);
    expect(aggregates.costPerTime).toBeCloseTo(11, 5);
  });

  it("returns 200 with every aggregate null for a vehicle with zero records", async () => {
    const vehicleId = await createVehicleId(sharedCookie);

    const res = await getAggregates(sharedCookie, vehicleId);
    expect(res.status).toBe(200);
    const aggregates = (await res.json()) as Aggregates;
    expect(aggregates).toEqual({
      costPerDistance: null,
      costPerTime: null,
      averageFuelEconomy: null,
      currentOdometer: null,
    });
  });

  it("returns null costPerDistance/costPerTime/averageFuelEconomy, but a real currentOdometer, for a single qualifying record (no span)", async () => {
    const vehicleId = await createVehicleId(sharedCookie);

    await createFuelRecord(sharedCookie, vehicleId, {
      fuelDate: "2026-02-01",
      odometerReading: 2000,
      volume: 40,
      cost: 60,
    });

    const res = await getAggregates(sharedCookie, vehicleId);
    const aggregates = (await res.json()) as Aggregates;
    expect(aggregates).toEqual({
      costPerDistance: null,
      costPerTime: null,
      averageFuelEconomy: null,
      currentOdometer: 2000,
    });
  });

  it("does not widen the distance span when two records share an odometer reading", async () => {
    const vehicleId = await createVehicleId(sharedCookie);

    // Different dates so this pair is never semantic-duplicate-flagged (D-005 requires an exact
    // date match) — isolates the "same odometer reading" case from duplicate exclusion.
    await createFuelRecord(sharedCookie, vehicleId, {
      fuelDate: "2026-03-01",
      odometerReading: 3000,
      volume: 40,
      cost: 60,
    });
    await createFuelRecord(sharedCookie, vehicleId, {
      fuelDate: "2026-03-15",
      odometerReading: 3000,
      volume: 38,
      cost: 55,
    });

    const aggregates = (await (await getAggregates(sharedCookie, vehicleId)).json()) as Aggregates;
    expect(aggregates.costPerDistance).toBeNull();
    // Time span is still 14 days on a nonzero total cost, so costPerTime computes normally —
    // proving the two null guards are independent.
    expect(aggregates.costPerTime).toBeCloseTo(115 / 14, 5);
  });

  it("does not widen the day span when two records share a date", async () => {
    const vehicleId = await createVehicleId(sharedCookie);

    // Odometer delta (100) exceeds the fuel duplicate-detection tolerance (5), so this pair is
    // never flagged despite sharing a date — isolates the "same date" case from duplicate
    // exclusion.
    await createFuelRecord(sharedCookie, vehicleId, {
      fuelDate: "2026-04-01",
      odometerReading: 4000,
      volume: 40,
      cost: 60,
    });
    await createFuelRecord(sharedCookie, vehicleId, {
      fuelDate: "2026-04-01",
      odometerReading: 4100,
      volume: 38,
      cost: 55,
    });

    const aggregates = (await (await getAggregates(sharedCookie, vehicleId)).json()) as Aggregates;
    expect(aggregates.costPerTime).toBeNull();
    expect(aggregates.costPerDistance).toBeCloseTo(115 / 100, 5);
  });

  it("excludes a semantic-duplicate-flagged record's cost, odometer reading, and date entirely", async () => {
    const vehicleId = await createVehicleId(sharedCookie);

    const first = (await (await createFuelRecord(sharedCookie, vehicleId, {
      fuelDate: "2026-05-01",
      odometerReading: 5000,
      volume: 40,
      cost: 60,
    })).json()) as { id: string; duplicateOfId: string | null };
    expect(first.duplicateOfId).toBeNull();

    await createFuelRecord(sharedCookie, vehicleId, {
      fuelDate: "2026-05-10",
      odometerReading: 5100,
      volume: 38,
      cost: 55,
    });

    const baseline = (await (await getAggregates(sharedCookie, vehicleId)).json()) as Aggregates;

    // Same date and within the odometer tolerance of `first` — gets flagged against it.
    const duplicate = (await (await createFuelRecord(sharedCookie, vehicleId, {
      fuelDate: "2026-05-01",
      odometerReading: 5002,
      volume: 1,
      cost: 999,
    })).json()) as { duplicateOfId: string | null };
    expect(duplicate.duplicateOfId).toBe(first.id);

    const afterDuplicate = (await (await getAggregates(sharedCookie, vehicleId))
      .json()) as Aggregates;
    expect(afterDuplicate).toEqual(baseline);
  });

  it("skips a service record's null cost / null odometer reading without erroring", async () => {
    const vehicleId = await createVehicleId(sharedCookie);

    await createFuelRecord(sharedCookie, vehicleId, {
      fuelDate: "2026-06-01",
      odometerReading: 6000,
      volume: 40,
      cost: 50,
    });
    // Cost and odometer reading both omitted — both optional per spec 007.
    await createServiceRecord(sharedCookie, vehicleId, {
      serviceDate: "2026-06-15",
      description: "Inspection, no cost recorded",
    });

    const res = await getAggregates(sharedCookie, vehicleId);
    expect(res.status).toBe(200);
    const aggregates = (await res.json()) as Aggregates;
    // Only the fuel record's odometer reading qualifies (1 point) -> no distance span.
    expect(aggregates.costPerDistance).toBeNull();
    // Both records' dates qualify -> a 14-day span over the fuel record's cost alone (50).
    expect(aggregates.costPerTime).toBeCloseTo(50 / 14, 5);
  });

  it("reflects a deleted record's removal on the very next request (SC-004)", async () => {
    const vehicleId = await createVehicleId(sharedCookie);

    await createFuelRecord(sharedCookie, vehicleId, {
      fuelDate: "2026-07-01",
      odometerReading: 7000,
      volume: 40,
      cost: 50,
    });
    const second = (await (await createFuelRecord(sharedCookie, vehicleId, {
      fuelDate: "2026-07-11",
      odometerReading: 7200,
      volume: 42,
      cost: 70,
    })).json()) as { id: string };

    const before = (await (await getAggregates(sharedCookie, vehicleId)).json()) as Aggregates;
    expect(before.costPerDistance).toBeCloseTo(120 / 200, 5);

    const deleteRes = await deleteFuelRecordReq(sharedCookie, second.id);
    expect(deleteRes.status).toBe(204);

    const after = (await (await getAggregates(sharedCookie, vehicleId)).json()) as Aggregates;
    // Only one record remains — no span, so costPerDistance drops to null rather than staying
    // stale at the pre-delete value.
    expect(after.costPerDistance).toBeNull();
  });

  it("refuses aggregates for a nonexistent vehicle and a different tenant's vehicle identically", async () => {
    const missingRes = await getAggregates(sharedCookie, crypto.randomUUID());
    expect(missingRes.status).toBe(404);

    const otherTenant = await createSession();
    const otherVehicleId = await createVehicleId(otherTenant.cookie);
    const crossTenantRes = await getAggregates(sharedCookie, otherVehicleId);
    expect(crossTenantRes.status).toBe(404);
  });
});

describe("vehicle aggregates: currentOdometer (specs/034, US1)", () => {
  let sharedCookie: string;

  beforeAll(async () => {
    sharedCookie = (await createSession()).cookie;
  });

  it("returns the highest odometer reading across service and fuel records combined", async () => {
    const vehicleId = await createVehicleId(sharedCookie);

    await createServiceRecord(sharedCookie, vehicleId, {
      serviceDate: "2026-07-01",
      description: "Inspection",
      odometerReading: 15_000,
    });
    await createFuelRecord(sharedCookie, vehicleId, {
      fuelDate: "2026-07-11",
      odometerReading: 15_500,
      volume: 40,
      cost: 60,
    });

    const aggregates = (await (await getAggregates(sharedCookie, vehicleId)).json()) as Aggregates;
    expect(aggregates.currentOdometer).toBe(15_500);
  });

  it("returns null for a vehicle with no service or fuel records", async () => {
    const vehicleId = await createVehicleId(sharedCookie);

    const aggregates = (await (await getAggregates(sharedCookie, vehicleId)).json()) as Aggregates;
    expect(aggregates.currentOdometer).toBeNull();
  });

  it("excludes a semantic-duplicate-flagged record's odometer reading from the max", async () => {
    const vehicleId = await createVehicleId(sharedCookie);

    const first = (await (await createFuelRecord(sharedCookie, vehicleId, {
      fuelDate: "2026-07-20",
      odometerReading: 16_000,
      volume: 40,
      cost: 60,
    })).json()) as { id: string; duplicateOfId: string | null };
    expect(first.duplicateOfId).toBeNull();

    // Same date and within the fuel duplicate-detection odometer tolerance (±5) — flags against
    // `first`. Its slightly-higher odometer reading must not win the max once excluded.
    const duplicate = (await (await createFuelRecord(sharedCookie, vehicleId, {
      fuelDate: "2026-07-20",
      odometerReading: 16_005,
      volume: 1,
      cost: 999,
    })).json()) as { duplicateOfId: string | null };
    expect(duplicate.duplicateOfId).toBe(first.id);

    const aggregates = (await (await getAggregates(sharedCookie, vehicleId)).json()) as Aggregates;
    expect(aggregates.currentOdometer).toBe(16_000);
  });
});

describe("vehicle aggregates: averageFuelEconomy (spec 013, US2)", () => {
  let sharedCookie: string;

  beforeAll(async () => {
    sharedCookie = (await createSession()).cookie;
  });

  it("averages the computable per-fuel-record economy values", async () => {
    const vehicleId = await createVehicleId(sharedCookie);

    // First record has no predecessor, so its own economy is null and it's excluded from the
    // mean (spec 009's existing computeFuelEconomy behavior).
    await createFuelRecord(sharedCookie, vehicleId, {
      fuelDate: "2026-08-01",
      odometerReading: 8000,
      volume: 40,
      cost: 60,
    });
    // delta 500 -> 45 / (500/100) = 9 L/100km
    await createFuelRecord(sharedCookie, vehicleId, {
      fuelDate: "2026-08-11",
      odometerReading: 8500,
      volume: 45,
      cost: 65,
    });
    // delta 500 -> 50 / (500/100) = 10 L/100km
    await createFuelRecord(sharedCookie, vehicleId, {
      fuelDate: "2026-08-21",
      odometerReading: 9000,
      volume: 50,
      cost: 70,
    });

    const aggregates = (await (await getAggregates(sharedCookie, vehicleId)).json()) as Aggregates;
    expect(aggregates.averageFuelEconomy).toBeCloseTo((9 + 10) / 2, 5);
  });

  it("returns null averageFuelEconomy when no fuel record has a computable economy yet", async () => {
    const vehicleId = await createVehicleId(sharedCookie);

    await createFuelRecord(sharedCookie, vehicleId, {
      fuelDate: "2026-09-01",
      odometerReading: 9500,
      volume: 40,
      cost: 60,
    });

    const aggregates = (await (await getAggregates(sharedCookie, vehicleId)).json()) as Aggregates;
    expect(aggregates.averageFuelEconomy).toBeNull();
  });

  it("computes costPerDistance/costPerTime from service records alone while averageFuelEconomy stays null", async () => {
    const vehicleId = await createVehicleId(sharedCookie);

    await createServiceRecord(sharedCookie, vehicleId, {
      serviceDate: "2026-10-01",
      description: "Brake pads",
      odometerReading: 10_000,
      cost: 100,
    });
    await createServiceRecord(sharedCookie, vehicleId, {
      serviceDate: "2026-10-11",
      description: "Oil change",
      odometerReading: 10_200,
      cost: 150,
    });

    const aggregates = (await (await getAggregates(sharedCookie, vehicleId)).json()) as Aggregates;
    expect(aggregates.averageFuelEconomy).toBeNull();
    expect(aggregates.costPerDistance).toBeCloseTo(250 / 200, 5);
    expect(aggregates.costPerTime).toBeCloseTo(250 / 10, 5);
  });
});

describe("expense breakdown (monthly, User Story 1)", () => {
  it("sums maintenance/fuel/total per month across two different months (SC-002)", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);

    await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-01-05",
      description: "Oil change",
      cost: 60,
    });
    await createFuelRecord(cookie, vehicleId, {
      fuelDate: "2026-01-20",
      odometerReading: 1000,
      volume: 40,
      cost: 55,
    });
    await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-02-10",
      description: "Tire rotation",
      cost: 40,
    });

    const res = await getExpenseBreakdown(cookie, vehicleId, "month");
    expect(res.status).toBe(200);
    const { periods } = (await res.json()) as { periods: ExpensePeriod[] };
    expect(periods).toEqual([
      { period: "2026-01", maintenanceCost: 60, fuelCost: 55, totalCost: 115 },
      { period: "2026-02", maintenanceCost: 40, fuelCost: 0, totalCost: 40 },
    ]);
  });

  it("returns an empty list for a vehicle with no records, not an error (SC-003)", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);

    const res = await getExpenseBreakdown(cookie, vehicleId, "month");
    expect(res.status).toBe(200);
    const { periods } = (await res.json()) as { periods: ExpensePeriod[] };
    expect(periods).toEqual([]);
  });

  it("treats a service record with no cost as contributing zero, not fabricated or skipped (FR-005)", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);

    await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-03-01",
      description: "Inspection, no receipt",
    });

    const { periods } = (await (await getExpenseBreakdown(cookie, vehicleId, "month")).json()) as {
      periods: ExpensePeriod[];
    };
    expect(periods).toEqual([
      { period: "2026-03", maintenanceCost: 0, fuelCost: 0, totalCost: 0 },
    ]);
  });

  it("excludes a record flagged as a semantic duplicate from its period's totals (FR-006)", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);

    await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-04-01",
      description: "Oil change",
      cost: 60,
    });
    // Same date + same description (case-insensitive) auto-flags as a duplicate (D-005).
    await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-04-01",
      description: "OIL CHANGE",
      cost: 999,
    });

    const { periods } = (await (await getExpenseBreakdown(cookie, vehicleId, "month")).json()) as {
      periods: ExpensePeriod[];
    };
    expect(periods).toEqual([
      { period: "2026-04", maintenanceCost: 60, fuelCost: 0, totalCost: 60 },
    ]);
  });

  it("returns periods in chronological order (FR-008)", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);

    await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-06-01",
      description: "Later",
      cost: 10,
    });
    await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-01-01",
      description: "Earlier",
      cost: 10,
    });

    const { periods } = (await (await getExpenseBreakdown(cookie, vehicleId, "month")).json()) as {
      periods: ExpensePeriod[];
    };
    expect(periods.map((p) => p.period)).toEqual(["2026-01", "2026-06"]);
  });
});

describe("expense breakdown (yearly, User Story 2)", () => {
  it("groups the same records by year, summing to the same totals (SC-001, SC-002)", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);

    await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-01-05",
      description: "Oil change",
      cost: 60,
    });
    await createFuelRecord(cookie, vehicleId, {
      fuelDate: "2026-11-20",
      odometerReading: 1000,
      volume: 40,
      cost: 55,
    });
    await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2027-02-10",
      description: "Tire rotation",
      cost: 40,
    });

    const { periods } = (await (await getExpenseBreakdown(cookie, vehicleId, "year")).json()) as {
      periods: ExpensePeriod[];
    };
    expect(periods).toEqual([
      { period: "2026", maintenanceCost: 60, fuelCost: 55, totalCost: 115 },
      { period: "2027", maintenanceCost: 40, fuelCost: 0, totalCost: 40 },
    ]);
  });

  it("rejects an invalid groupBy value and computes nothing", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);

    const res = await getExpenseBreakdown(cookie, vehicleId, "week");
    expect(res.status).toBe(400);
  });

  it("rejects a missing groupBy query param rather than silently defaulting (FR-002)", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);

    const res = await getExpenseBreakdown(cookie, vehicleId);
    expect(res.status).toBe(400);
  });
});

describe("expense breakdown cross-tenant isolation", () => {
  it("refuses a different tenant's vehicle or a made-up id, identically (SC-004, FR-007)", async () => {
    const owner = await createSession();
    const other = await createSession();
    const vehicleId = await createVehicleId(owner.cookie);
    const madeUpId = crypto.randomUUID();

    const crossFetch = await getExpenseBreakdown(other.cookie, vehicleId, "month");
    const madeUpFetch = await getExpenseBreakdown(other.cookie, madeUpId, "month");
    expect(crossFetch.status).toBe(404);
    expect(madeUpFetch.status).toBe(404);
    expect(await crossFetch.text()).toBe(await madeUpFetch.text());
  });
});
