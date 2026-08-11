import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { escapeLikePattern } from "../../src/server/db/repository";

function cookieValue(setCookie: string | null): string {
  if (!setCookie) throw new Error("missing Set-Cookie header");
  return setCookie.split(";")[0] ?? "";
}

async function createSession(): Promise<{ cookie: string; tenantId: string }> {
  const res = await SELF.fetch("https://example.com/api/v1/_dev/session", { method: "POST" });
  const body = (await res.json()) as { tenantId: string };
  return { cookie: cookieValue(res.headers.get("set-cookie")), tenantId: body.tenantId };
}

type VehicleBody = {
  name?: unknown;
  odometerUnit?: unknown;
  make?: unknown;
  model?: unknown;
  year?: unknown;
  vin?: unknown;
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

function createDocument(
  cookie: string,
  vehicleId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/documents`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

type RecordMatch = {
  id: string;
  vehicleId: string;
  vehicleName: string;
  title: string;
  notes: string | null;
};

type SearchResults = {
  vehicles: { id: string; name: string }[];
  serviceRecords: RecordMatch[];
  fuelRecords: RecordMatch[];
  documents: RecordMatch[];
};

function search(cookie: string, q: string | undefined): Promise<Response> {
  const query = q !== undefined ? `?q=${encodeURIComponent(q)}` : "";
  return SELF.fetch(`https://example.com/api/v1/search${query}`, {
    headers: { Cookie: cookie },
  });
}

describe("search match correctness (User Story 1)", () => {
  it("matches a vehicle by name/make/model/VIN (FR-003)", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie, {
      name: "Roadster",
      make: "Tesla",
      model: "Model 3",
      vin: "5YJ3E1EA1JF000001",
    });

    const byName = (await (await search(cookie, "roadster")).json()) as SearchResults;
    expect(byName.vehicles.map((v) => v.id)).toContain(vehicleId);

    const byVin = (await (await search(cookie, "JF000001")).json()) as SearchResults;
    expect(byVin.vehicles.map((v) => v.id)).toContain(vehicleId);
  });

  it("matches service/fuel/document records, each identifying its vehicle (FR-004/005/006/008)", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie, { name: "My Truck" });

    await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-01-01",
      description: "Bridgestone tires installed",
    });
    await createFuelRecord(cookie, vehicleId, {
      fuelDate: "2026-01-02",
      odometerReading: 1000,
      volume: 40,
      cost: 55,
      station: "Bridgestone Fuel Stop",
    });
    await createDocument(cookie, vehicleId, {
      title: "Bridgestone warranty card",
      category: "warranty",
    });

    const results = (await (await search(cookie, "bridgestone")).json()) as SearchResults;
    expect(results.serviceRecords.length).toBe(1);
    expect(results.serviceRecords[0]?.vehicleId).toBe(vehicleId);
    expect(results.serviceRecords[0]?.vehicleName).toBe("My Truck");
    expect(results.fuelRecords.length).toBe(1);
    expect(results.fuelRecords[0]?.vehicleId).toBe(vehicleId);
    expect(results.documents.length).toBe(1);
    expect(results.documents[0]?.vehicleId).toBe(vehicleId);
  });

  it("returns an empty, valid result set for a query matching nothing (FR-010, SC-004)", async () => {
    const { cookie } = await createSession();
    await createVehicleId(cookie, { name: "Nothing Matches Here" });

    const res = await search(cookie, "zzzznomatch");
    expect(res.status).toBe(200);
    const results = (await res.json()) as SearchResults;
    expect(results.vehicles).toEqual([]);
    expect(results.serviceRecords).toEqual([]);
    expect(results.fuelRecords).toEqual([]);
    expect(results.documents).toEqual([]);
  });

  it("matches a partial word regardless of case (SC-003)", async () => {
    const { cookie } = await createSession();
    await createVehicleId(cookie, { name: "Subaru Outback" });

    const results = (await (await search(cookie, "BACK")).json()) as SearchResults;
    expect(results.vehicles.some((v) => v.name === "Subaru Outback")).toBe(true);
  });
});

describe("search cross-tenant isolation (User Story 2)", () => {
  it("never returns another tenant's matching data, even for the exact same term (SC-002, FR-009)", async () => {
    const tenantA = await createSession();
    const tenantB = await createSession();
    const vehicleA = await createVehicleId(tenantA.cookie, { name: "Shared Term Vehicle" });
    const vehicleB = await createVehicleId(tenantB.cookie, { name: "Shared Term Vehicle" });
    await createServiceRecord(tenantA.cookie, vehicleA, {
      serviceDate: "2026-01-01",
      description: "Shared Term Service",
    });
    await createServiceRecord(tenantB.cookie, vehicleB, {
      serviceDate: "2026-01-01",
      description: "Shared Term Service",
    });

    const resultsA = (await (await search(tenantA.cookie, "Shared Term")).json()) as SearchResults;
    expect(resultsA.vehicles.map((v) => v.id)).toEqual([vehicleA]);
    expect(resultsA.serviceRecords.every((r) => r.vehicleId === vehicleA)).toBe(true);
  });
});

describe("short query rejection (User Story 3)", () => {
  it("rejects a query shorter than 2 characters (SC-005, FR-002)", async () => {
    const { cookie } = await createSession();
    const res = await search(cookie, "a");
    expect(res.status).toBe(400);
  });

  it("rejects a missing q parameter", async () => {
    const { cookie } = await createSession();
    const res = await search(cookie, undefined);
    expect(res.status).toBe(400);
  });

  it("rejects a whitespace-only query that trims below the minimum length", async () => {
    const { cookie } = await createSession();
    const res = await search(cookie, "  a ");
    expect(res.status).toBe(400);
  });
});

describe("semantic duplicates still appear in search results (FR-007)", () => {
  it("includes a duplicate-flagged service record alongside the original", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);

    await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-03-01",
      description: "Unique Duplicate Term",
    });
    await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-03-01",
      description: "UNIQUE DUPLICATE TERM",
    });

    const results = (await (await search(cookie, "Unique Duplicate")).json()) as SearchResults;
    expect(results.serviceRecords.length).toBe(2);
  });
});

describe("LIKE special-character escaping", () => {
  it("escapeLikePattern escapes backslash, percent, and underscore", () => {
    expect(escapeLikePattern("50%")).toBe("50\\%");
    expect(escapeLikePattern("a_b")).toBe("a\\_b");
    expect(escapeLikePattern("a\\b")).toBe("a\\\\b");
  });

  it("a literal percent sign in the query matches only records containing it literally, not everything", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);

    await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-04-01",
      description: "Discount",
      notes: "10% off labor",
    });
    await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-04-02",
      description: "No percent here",
    });

    const results = (await (await search(cookie, "10%")).json()) as SearchResults;
    expect(results.serviceRecords.length).toBe(1);
    expect(results.serviceRecords[0]?.notes).toBe("10% off labor");
  });

  it("a literal underscore in the query matches only records containing it literally", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);

    await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-05-01",
      description: "part_number_A1",
    });
    await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-05-02",
      description: "partXnumberXA1",
    });

    const results = (await (await search(cookie, "part_number")).json()) as SearchResults;
    expect(results.serviceRecords.length).toBe(1);
    expect(results.serviceRecords[0]?.title).toBe("part_number_A1");
  });
});
