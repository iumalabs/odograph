import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

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

function listServiceRecords(cookie: string, vehicleId: string): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/service-records`, {
    headers: { Cookie: cookie },
  });
}

describe("service record creation (User Story 1)", () => {
  it("creates a record with only the two required fields and it appears in the vehicle's list", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);

    const res = await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-01-15",
      description: "Oil change",
    });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: string; description: string };
    expect(created.description).toBe("Oil change");

    const listRes = await listServiceRecords(cookie, vehicleId);
    const { serviceRecords } = (await listRes.json()) as { serviceRecords: { id: string }[] };
    expect(serviceRecords.some((r) => r.id === created.id)).toBe(true);
  });

  it("stores every optional field exactly as submitted", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);

    const res = await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-02-01",
      description: "Brake pads replaced",
      odometerReading: 45000,
      cost: 250.5,
      notes: "Front pads only",
    });
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created).toMatchObject({
      serviceDate: "2026-02-01",
      description: "Brake pads replaced",
      odometerReading: 45000,
      cost: 250.5,
      notes: "Front pads only",
    });
  });

  it("rejects a missing serviceDate or description and creates nothing", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);

    const noDate = await createServiceRecord(cookie, vehicleId, { description: "No date" });
    expect(noDate.status).toBe(400);

    const noDescription = await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-03-01",
    });
    expect(noDescription.status).toBe(400);

    const listRes = await listServiceRecords(cookie, vehicleId);
    const { serviceRecords } = (await listRes.json()) as { serviceRecords: unknown[] };
    expect(serviceRecords.length).toBe(0);
  });

  it("refuses to create against a vehicle belonging to a different tenant or a made-up id, identically (FR-003)", async () => {
    const owner = await createSession();
    const other = await createSession();
    const vehicleId = await createVehicleId(owner.cookie);
    const madeUpId = crypto.randomUUID();

    const crossCreate = await createServiceRecord(other.cookie, vehicleId, {
      serviceDate: "2026-04-01",
      description: "Should fail",
    });
    const madeUpCreate = await createServiceRecord(other.cookie, madeUpId, {
      serviceDate: "2026-04-01",
      description: "Should fail",
    });
    expect(crossCreate.status).toBe(404);
    expect(madeUpCreate.status).toBe(404);
    expect(await crossCreate.text()).toBe(await madeUpCreate.text());

    const listRes = await listServiceRecords(owner.cookie, vehicleId);
    const { serviceRecords } = (await listRes.json()) as { serviceRecords: unknown[] };
    expect(serviceRecords.length).toBe(0);
  });
});
