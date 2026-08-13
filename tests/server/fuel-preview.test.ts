import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

function cookieValue(setCookie: string | null): string {
  if (!setCookie) throw new Error("missing Set-Cookie header");
  return setCookie.split(";")[0] ?? "";
}

async function createSession(): Promise<{ cookie: string }> {
  const res = await SELF.fetch("https://example.com/api/v1/_dev/session", { method: "POST" });
  return { cookie: cookieValue(res.headers.get("set-cookie")) };
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

function getPreview(
  cookie: string,
  vehicleId: string,
  query: Record<string, string>,
): Promise<Response> {
  const params = new URLSearchParams(query).toString();
  return SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/fuel-preview?${params}`, {
    headers: { Cookie: cookie },
  });
}

type Preview = { economy: number | null; costPerDistance: number | null };

describe("fuel preview: server-computed, division-safe live estimate (spec 040)", () => {
  let sharedCookie: string;

  beforeAll(async () => {
    sharedCookie = (await createSession()).cookie;
  });

  it("computes economy matching the saved-record formula (L/100km) against the prior fill-up", async () => {
    const vehicleId = await createVehicleId(sharedCookie);
    await createFuelRecord(sharedCookie, vehicleId, {
      fuelDate: "2026-01-01",
      odometerReading: 1000,
      volume: 40,
      cost: 60,
    });

    const res = await getPreview(sharedCookie, vehicleId, {
      odometerReading: "1500",
      volume: "40",
    });
    expect(res.status).toBe(200);
    const preview = (await res.json()) as Preview;
    // 500km travelled on 40L => 8 L/100km, same formula fuel-record-crud.test.ts asserts on save.
    expect(preview.economy).toBeCloseTo(8, 5);
    expect(preview.costPerDistance).toBeNull();
  });

  it("?unit=mi converts a km-native preview's economy correctly (specs/050 FR-002)", async () => {
    const vehicleId = await createVehicleId(sharedCookie);
    await createFuelRecord(sharedCookie, vehicleId, {
      fuelDate: "2026-01-01",
      odometerReading: 20_000,
      volume: 40,
      cost: 60,
    });

    const res = await getPreview(sharedCookie, vehicleId, {
      odometerReading: "20500",
      volume: "40",
      unit: "mi",
    });
    expect(res.status).toBe(200);
    const preview = (await res.json()) as Preview;
    // 500km/40L native (8 L/100km) converted, not reciprocally rescaled from 8.
    const KM_TO_MI = 0.621371;
    const L_TO_GAL = 0.264172;
    const expectedMi = (500 * KM_TO_MI) / (40 * L_TO_GAL);
    expect(preview.economy).toBeCloseTo(expectedMi, 5);
  });

  it("?unit=km explicitly matches the default (no-param) value (FR-003)", async () => {
    const vehicleId = await createVehicleId(sharedCookie);
    await createFuelRecord(sharedCookie, vehicleId, {
      fuelDate: "2026-01-01",
      odometerReading: 21_000,
      volume: 40,
      cost: 60,
    });

    const withoutParam = await getPreview(sharedCookie, vehicleId, {
      odometerReading: "21500",
      volume: "40",
    });
    const withKm = await getPreview(sharedCookie, vehicleId, {
      odometerReading: "21500",
      volume: "40",
      unit: "km",
    });
    expect((await withKm.json() as Preview).economy).toBeCloseTo(
      (await withoutParam.json() as Preview).economy as number,
      10,
    );
  });

  it("returns 400 for an unrecognized ?unit= value", async () => {
    const vehicleId = await createVehicleId(sharedCookie);
    const res = await getPreview(sharedCookie, vehicleId, {
      odometerReading: "1000",
      volume: "40",
      unit: "furlong",
    });
    expect(res.status).toBe(400);
  });

  it("?unit=km converts a mi-native preview's economy correctly (reverse direction — code-quality retrospective follow-up)", async () => {
    const vehicleId = await createVehicleId(sharedCookie, { odometerUnit: "mi" });
    await createFuelRecord(sharedCookie, vehicleId, {
      fuelDate: "2026-01-01",
      odometerReading: 30_000,
      volume: 10,
      cost: 40,
    });

    const res = await getPreview(sharedCookie, vehicleId, {
      odometerReading: "30300",
      volume: "10",
      unit: "km",
    });
    expect(res.status).toBe(200);
    const preview = (await res.json()) as Preview;
    // 300mi/10gal native (30 MPG) converted, not reciprocally rescaled from 30.
    const MI_TO_KM = 1.609344;
    const L_TO_GAL = 0.264172;
    const expectedKm = (10 / L_TO_GAL) / ((300 * MI_TO_KM) / 100);
    expect(preview.economy).toBeCloseTo(expectedKm, 5);
  });

  it("computes economy (MPG) for a mi-odometer vehicle", async () => {
    const vehicleId = await createVehicleId(sharedCookie, { odometerUnit: "mi" });
    await createFuelRecord(sharedCookie, vehicleId, {
      fuelDate: "2026-01-01",
      odometerReading: 10000,
      volume: 10,
      cost: 40,
    });

    const res = await getPreview(sharedCookie, vehicleId, {
      odometerReading: "10300",
      volume: "10",
    });
    const preview = (await res.json()) as Preview;
    // 300mi travelled on 10gal => 30 MPG.
    expect(preview.economy).toBeCloseTo(30, 5);
  });

  it("also returns costPerDistance when a positive cost is supplied", async () => {
    const vehicleId = await createVehicleId(sharedCookie);
    await createFuelRecord(sharedCookie, vehicleId, {
      fuelDate: "2026-02-01",
      odometerReading: 2000,
      volume: 40,
      cost: 60,
    });

    const res = await getPreview(sharedCookie, vehicleId, {
      odometerReading: "2100",
      volume: "8",
      cost: "10",
    });
    const preview = (await res.json()) as Preview;
    // 100km travelled, $10 spent => $0.10/km.
    expect(preview.costPerDistance).toBeCloseTo(0.1, 5);
  });

  it("returns both fields null for a vehicle with no prior fuel record", async () => {
    const vehicleId = await createVehicleId(sharedCookie);

    const res = await getPreview(sharedCookie, vehicleId, {
      odometerReading: "1000",
      volume: "40",
      cost: "60",
    });
    expect(res.status).toBe(200);
    expect((await res.json()) as Preview).toEqual({ economy: null, costPerDistance: null });
  });

  it("returns both fields null when the draft odometer reading isn't past the prior record", async () => {
    const vehicleId = await createVehicleId(sharedCookie);
    await createFuelRecord(sharedCookie, vehicleId, {
      fuelDate: "2026-03-01",
      odometerReading: 3000,
      volume: 40,
      cost: 60,
    });

    const res = await getPreview(sharedCookie, vehicleId, {
      odometerReading: "3000",
      volume: "40",
      cost: "60",
    });
    expect((await res.json()) as Preview).toEqual({ economy: null, costPerDistance: null });
  });

  it("returns economy null (never a divide-by-zero) when volume is zero", async () => {
    const vehicleId = await createVehicleId(sharedCookie);
    await createFuelRecord(sharedCookie, vehicleId, {
      fuelDate: "2026-04-01",
      odometerReading: 4000,
      volume: 40,
      cost: 60,
    });

    const res = await getPreview(sharedCookie, vehicleId, {
      odometerReading: "4500",
      volume: "0",
    });
    expect((await res.json()) as Preview).toEqual({ economy: null, costPerDistance: null });
  });

  it("returns costPerDistance null when cost is omitted even though economy is populated", async () => {
    const vehicleId = await createVehicleId(sharedCookie);
    await createFuelRecord(sharedCookie, vehicleId, {
      fuelDate: "2026-05-01",
      odometerReading: 5000,
      volume: 40,
      cost: 60,
    });

    const res = await getPreview(sharedCookie, vehicleId, {
      odometerReading: "5500",
      volume: "40",
    });
    const preview = (await res.json()) as Preview;
    expect(preview.economy).not.toBeNull();
    expect(preview.costPerDistance).toBeNull();
  });

  it("returns 400 when a required query param is missing or not a number", async () => {
    const vehicleId = await createVehicleId(sharedCookie);

    const missing = await getPreview(sharedCookie, vehicleId, { volume: "40" });
    expect(missing.status).toBe(400);

    const notANumber = await getPreview(sharedCookie, vehicleId, {
      odometerReading: "abc",
      volume: "40",
    });
    expect(notANumber.status).toBe(400);
  });

  it("returns 400 when an optional cost param is present but not a number", async () => {
    const vehicleId = await createVehicleId(sharedCookie);

    const res = await getPreview(sharedCookie, vehicleId, {
      odometerReading: "1000",
      volume: "40",
      cost: "abc",
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown vehicle", async () => {
    const res = await getPreview(sharedCookie, "00000000-0000-0000-0000-000000000000", {
      odometerReading: "1000",
      volume: "40",
    });
    expect(res.status).toBe(404);
  });

  it("excludes a semantic-duplicate-flagged record from the prior-record lookup", async () => {
    const vehicleId = await createVehicleId(sharedCookie);
    const first = (await (await createFuelRecord(sharedCookie, vehicleId, {
      fuelDate: "2026-06-01",
      odometerReading: 6000,
      volume: 40,
      cost: 60,
    })).json()) as { id: string; duplicateOfId: string | null };
    expect(first.duplicateOfId).toBeNull();

    // Same date, within the fuel duplicate-detection odometer tolerance — gets flagged against
    // `first`, so it must not become the "previous" record for the preview lookup.
    const duplicate = (await (await createFuelRecord(sharedCookie, vehicleId, {
      fuelDate: "2026-06-01",
      odometerReading: 6002,
      volume: 1,
      cost: 999,
    })).json()) as { duplicateOfId: string | null };
    expect(duplicate.duplicateOfId).toBe(first.id);

    const res = await getPreview(sharedCookie, vehicleId, {
      odometerReading: "6500",
      volume: "40",
    });
    const preview = (await res.json()) as Preview;
    // 500km against `first` (6000), not 498km against the flagged duplicate (6002).
    expect(preview.economy).toBeCloseTo(8, 5);
  });
});
