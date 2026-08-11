import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { getVehicleHistoryForReport } from "../../src/server/db/repository";
import type { FuelRecordWithEconomy, ServiceRecord, Vehicle } from "../../src/server/db/repository";
import { buildReportData } from "../../src/server/reports/maintenance-history-report";
import { renderReportPdf } from "../../src/server/reports/render-pdf";

function cookieValue(setCookie: string | null): string {
  if (!setCookie) throw new Error("missing Set-Cookie header");
  return setCookie.split(";")[0] ?? "";
}

async function createSession(): Promise<{ cookie: string; tenantId: string; userId: string }> {
  const res = await SELF.fetch("https://example.com/api/v1/_dev/session", { method: "POST" });
  const body = (await res.json()) as { tenantId: string; userId: string };
  return {
    cookie: cookieValue(res.headers.get("set-cookie")),
    tenantId: body.tenantId,
    userId: body.userId,
  };
}

type VehicleBody = {
  name?: unknown;
  odometerUnit?: unknown;
  make?: unknown;
  model?: unknown;
  year?: unknown;
};

async function createVehicleId(cookie: string, body: VehicleBody = {}): Promise<string> {
  const res = await SELF.fetch("https://example.com/api/v1/vehicles", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Test Vehicle", odometerUnit: "km", ...body }),
  });
  const created = (await res.json()) as { id: string };
  return created.id;
}

function createServiceRecord(
  cookie: string,
  vehicleId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/service-records`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createFuelRecord(
  cookie: string,
  vehicleId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/fuel-records`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getReport(cookie: string, vehicleId: string): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/report.pdf`, {
    headers: { Cookie: cookie },
  });
}

const BASE_VEHICLE: Vehicle = {
  id: "v1",
  tenantId: "t1",
  name: "My Car",
  make: null,
  model: null,
  year: null,
  vin: null,
  odometerUnit: "km",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function serviceRow(overrides: Partial<ServiceRecord> = {}): ServiceRecord {
  return {
    id: "s1",
    tenantId: "t1",
    vehicleId: "v1",
    serviceDate: "2026-01-05",
    description: "Oil change",
    odometerReading: 1000,
    cost: 60,
    notes: null,
    duplicateOfId: null,
    createdAt: "2026-01-05T00:00:00.000Z",
    updatedAt: "2026-01-05T00:00:00.000Z",
    ...overrides,
  };
}

function fuelRow(overrides: Partial<FuelRecordWithEconomy> = {}): FuelRecordWithEconomy {
  return {
    id: "f1",
    tenantId: "t1",
    vehicleId: "v1",
    fuelDate: "2026-01-10",
    odometerReading: 1200,
    volume: 40,
    cost: 55,
    station: "Shell",
    notes: null,
    duplicateOfId: null,
    fuelEconomy: 5.5,
    createdAt: "2026-01-10T00:00:00.000Z",
    updatedAt: "2026-01-10T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildReportData (pure, User Story 1/2/3)", () => {
  it("joins make/model/year into vehicleSpec, or null if all three are unset", () => {
    const withSpec = buildReportData(
      { ...BASE_VEHICLE, make: "Toyota", model: "Corolla", year: 2020 },
      [],
      [],
    );
    expect(withSpec.vehicleSpec).toBe("Toyota Corolla 2020");

    const withoutSpec = buildReportData(BASE_VEHICLE, [], []);
    expect(withoutSpec.vehicleSpec).toBeNull();
  });

  it("maps every provided field intact for service and fuel rows", () => {
    const data = buildReportData(BASE_VEHICLE, [serviceRow()], [fuelRow()]);
    expect(data.serviceRows).toEqual([
      { date: "2026-01-05", description: "Oil change", odometerReading: 1000, cost: 60 },
    ]);
    expect(data.fuelRows).toEqual([
      {
        date: "2026-01-10",
        station: "Shell",
        volume: 40,
        cost: 55,
        odometerReading: 1200,
        fuelEconomy: 5.5,
      },
    ]);
  });

  it("maps a missing field to null, never a fabricated value (FR-007)", () => {
    const data = buildReportData(
      BASE_VEHICLE,
      [serviceRow({ cost: null, odometerReading: null })],
      [fuelRow({ station: null, fuelEconomy: null })],
    );
    expect(data.serviceRows[0]?.cost).toBeNull();
    expect(data.serviceRows[0]?.odometerReading).toBeNull();
    expect(data.fuelRows[0]?.station).toBeNull();
    expect(data.fuelRows[0]?.fuelEconomy).toBeNull();
  });

  it("sums totals correctly, with a missing service-record cost contributing 0 (FR-008, SC-004)", () => {
    const data = buildReportData(
      BASE_VEHICLE,
      [serviceRow({ cost: 60 }), serviceRow({ id: "s2", cost: null })],
      [fuelRow({ cost: 55 })],
    );
    expect(data.totalMaintenanceCost).toBe(60);
    expect(data.totalFuelCost).toBe(55);
    expect(data.totalCost).toBe(115);
  });

  it("produces empty rows and all-zero totals for a vehicle with no records, no error (FR-009)", () => {
    const data = buildReportData(BASE_VEHICLE, [], []);
    expect(data.serviceRows).toEqual([]);
    expect(data.fuelRows).toEqual([]);
    expect(data.totalMaintenanceCost).toBe(0);
    expect(data.totalFuelCost).toBe(0);
    expect(data.totalCost).toBe(0);
  });
});

describe("getVehicleHistoryForReport (repository, speckit-analyze finding C1)", () => {
  it("excludes a semantic duplicate from the returned services (FR-006)", async () => {
    const { cookie, tenantId, userId } = await createSession();
    const vehicleId = await createVehicleId(cookie);

    await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-02-01",
      description: "Oil change",
      cost: 60,
    });
    await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-02-01",
      description: "OIL CHANGE",
      cost: 999,
    });

    const { services } = await getVehicleHistoryForReport(env.DB, { tenantId, userId }, vehicleId);
    expect(services.length).toBe(1);
    expect(services[0]?.cost).toBe(60);
  });
});

describe("renderReportPdf (structural, User Story 1/3)", () => {
  it("produces valid PDF bytes for populated data", async () => {
    const data = buildReportData(BASE_VEHICLE, [serviceRow()], [fuelRow()]);
    const bytes = await renderReportPdf(data);
    const header = new TextDecoder().decode(bytes.slice(0, 5));
    expect(header).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(100);
  });

  it("produces valid PDF bytes for an empty report, no error (FR-009)", async () => {
    const data = buildReportData(BASE_VEHICLE, [], []);
    const bytes = await renderReportPdf(data);
    const header = new TextDecoder().decode(bytes.slice(0, 5));
    expect(header).toBe("%PDF-");
  });
});

describe("summary totals end to end (User Story 2)", () => {
  it("computes correct totals from real, HTTP-created records, including one with no cost (SC-004)", async () => {
    const { cookie, tenantId, userId } = await createSession();
    const vehicleId = await createVehicleId(cookie);

    await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-04-01",
      description: "Oil change",
      cost: 60,
    });
    await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-04-15",
      description: "Inspection, no receipt",
    });
    await createFuelRecord(cookie, vehicleId, {
      fuelDate: "2026-04-10",
      odometerReading: 500,
      volume: 40,
      cost: 55,
    });

    const { services, fuels } = await getVehicleHistoryForReport(
      env.DB,
      { tenantId, userId },
      vehicleId,
    );
    const vehicle = { ...BASE_VEHICLE, id: vehicleId, tenantId };
    const data = buildReportData(vehicle, services, fuels);
    expect(data.totalMaintenanceCost).toBe(60);
    expect(data.totalFuelCost).toBe(55);
    expect(data.totalCost).toBe(115);
  });
});

describe("GET /:vehicleId/report.pdf (route integration, User Story 1)", () => {
  it("returns a valid, downloadable PDF for a vehicle with history (SC-001)", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-03-01",
      description: "Brake pads",
      cost: 120,
    });
    await createFuelRecord(cookie, vehicleId, {
      fuelDate: "2026-03-05",
      odometerReading: 500,
      volume: 40,
      cost: 55,
    });

    const res = await getReport(cookie, vehicleId);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("attachment");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("returns a valid PDF for a vehicle with zero records, not an error (SC-005, FR-009)", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);

    const res = await getReport(cookie, vehicleId);
    expect(res.status).toBe(200);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("refuses a different tenant's vehicle or a made-up id, identically (SC-003, FR-002)", async () => {
    const owner = await createSession();
    const other = await createSession();
    const vehicleId = await createVehicleId(owner.cookie);
    const madeUpId = crypto.randomUUID();

    const crossFetch = await getReport(other.cookie, vehicleId);
    const madeUpFetch = await getReport(other.cookie, madeUpId);
    expect(crossFetch.status).toBe(404);
    expect(madeUpFetch.status).toBe(404);
    expect(await crossFetch.text()).toBe(await madeUpFetch.text());
  });
});
