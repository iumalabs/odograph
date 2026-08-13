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
): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/service-records`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
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
