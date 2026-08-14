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

type VehicleBody = {
  name?: unknown;
  odometerUnit?: unknown;
  make?: unknown;
  model?: unknown;
  year?: unknown;
  vin?: unknown;
};

function createVehicle(cookie: string, body: VehicleBody): Promise<Response> {
  return SELF.fetch("https://example.com/api/v1/vehicles", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function listVehicles(cookie: string): Promise<Response> {
  return SELF.fetch("https://example.com/api/v1/vehicles", { headers: { Cookie: cookie } });
}

function getVehicle(cookie: string, id: string): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicles/${id}`, { headers: { Cookie: cookie } });
}

function patchVehicle(cookie: string, id: string, body: VehicleBody): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicles/${id}`, {
    method: "PATCH",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteVehicleReq(cookie: string, id: string): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicles/${id}`, {
    method: "DELETE",
    headers: { Cookie: cookie },
  });
}

const currentYear = new Date().getUTCFullYear();

describe("vehicle creation (User Story 1)", () => {
  it("creates a vehicle with only the required fields and it appears in the list", async () => {
    const { cookie } = await createSession();
    const res = await createVehicle(cookie, { name: "Daily Driver", odometerUnit: "km" });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: string; name: string };
    expect(created.name).toBe("Daily Driver");

    const listRes = await listVehicles(cookie);
    const { vehicles } = (await listRes.json()) as { vehicles: { id: string }[] };
    expect(vehicles.some((v) => v.id === created.id)).toBe(true);
  });

  it("stores every optional field exactly as submitted", async () => {
    const { cookie } = await createSession();
    const res = await createVehicle(cookie, {
      name: "Weekend Car",
      odometerUnit: "mi",
      make: "Honda",
      model: "Civic",
      year: 2019,
      vin: "1HGCM82633A004352",
    });
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created).toMatchObject({
      name: "Weekend Car",
      odometerUnit: "mi",
      make: "Honda",
      model: "Civic",
      year: 2019,
      vin: "1HGCM82633A004352",
    });
  });

  it("rejects a missing name or odometerUnit and creates nothing", async () => {
    const { cookie } = await createSession();

    const noName = await createVehicle(cookie, { odometerUnit: "km" });
    expect(noName.status).toBe(400);

    const noUnit = await createVehicle(cookie, { name: "No Unit" });
    expect(noUnit.status).toBe(400);

    const listRes = await listVehicles(cookie);
    const { vehicles } = (await listRes.json()) as { vehicles: unknown[] };
    expect(vehicles.length).toBe(0);
  });

  it("creates two vehicles with identical make/model as distinct records (FR-010)", async () => {
    const { cookie } = await createSession();
    const first = await createVehicle(cookie, {
      name: "Car One",
      odometerUnit: "km",
      make: "Toyota",
      model: "Corolla",
    });
    const second = await createVehicle(cookie, {
      name: "Car Two",
      odometerUnit: "km",
      make: "Toyota",
      model: "Corolla",
    });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);

    const firstBody = (await first.json()) as { id: string };
    const secondBody = (await second.json()) as { id: string };
    expect(firstBody.id).not.toBe(secondBody.id);
  });

  it("rejects a year outside [1900, currentYear+10] and accepts the bounds", async () => {
    const { cookie } = await createSession();

    const tooOld = await createVehicle(cookie, { name: "Too Old", odometerUnit: "km", year: 1899 });
    expect(tooOld.status).toBe(400);

    const tooNew = await createVehicle(cookie, {
      name: "Too New",
      odometerUnit: "km",
      year: currentYear + 11,
    });
    expect(tooNew.status).toBe(400);

    const lowerBound = await createVehicle(cookie, {
      name: "Lower Bound",
      odometerUnit: "km",
      year: 1900,
    });
    expect(lowerBound.status).toBe(201);

    const upperBound = await createVehicle(cookie, {
      name: "Upper Bound",
      odometerUnit: "km",
      year: currentYear + 10,
    });
    expect(upperBound.status).toBe(201);
  });

  it("rejects an odometerUnit value that isn't km/mi and creates nothing (FR-009)", async () => {
    const { cookie } = await createSession();
    const res = await createVehicle(cookie, { name: "Bad Unit", odometerUnit: "gallons" });
    expect(res.status).toBe(400);

    const listRes = await listVehicles(cookie);
    const { vehicles } = (await listRes.json()) as { vehicles: unknown[] };
    expect(vehicles.length).toBe(0);
  });
});

describe("vehicle read/update (User Story 2)", () => {
  it("lists only the caller's own vehicles across two tenants (FR-003)", async () => {
    const tenantA = await createSession();
    const tenantB = await createSession();

    await createVehicle(tenantA.cookie, { name: "A's Car", odometerUnit: "km" });
    await createVehicle(tenantB.cookie, { name: "B's Car", odometerUnit: "km" });

    const listA = (await (await listVehicles(tenantA.cookie)).json()) as {
      vehicles: { name: string }[];
    };
    expect(listA.vehicles.map((v) => v.name)).toEqual(["A's Car"]);
  });

  it("fetches a vehicle by id with its full current details", async () => {
    const { cookie } = await createSession();
    const created = (await (await createVehicle(cookie, {
      name: "Fetch Me",
      odometerUnit: "km",
      make: "Ford",
    })).json()) as { id: string };

    const res = await getVehicle(cookie, created.id);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ name: "Fetch Me", make: "Ford" });
  });

  it("updating one field leaves every other field unchanged (SC-003)", async () => {
    const { cookie } = await createSession();
    const created = (await (await createVehicle(cookie, {
      name: "Original Name",
      odometerUnit: "km",
      make: "Mazda",
      model: "3",
      year: 2020,
      vin: "SOMEVIN123",
    })).json()) as Record<string, unknown>;

    const patched = await patchVehicle(cookie, created.id as string, { name: "New Name" });
    expect(patched.status).toBe(200);
    const patchedBody = (await patched.json()) as Record<string, unknown>;

    expect(patchedBody.name).toBe("New Name");
    for (const field of ["make", "model", "year", "vin", "odometerUnit"]) {
      expect(patchedBody[field]).toBe(created[field]);
    }
  });

  it("refuses to fetch, update, or delete a different tenant's vehicle, identically to a made-up id (FR-007/SC-002)", async () => {
    const owner = await createSession();
    const other = await createSession();
    const created = (await (await createVehicle(owner.cookie, {
      name: "Owner's Car",
      odometerUnit: "km",
    })).json()) as { id: string };
    const madeUpId = crypto.randomUUID();

    const crossFetch = await getVehicle(other.cookie, created.id);
    const madeUpFetch = await getVehicle(other.cookie, madeUpId);
    expect(crossFetch.status).toBe(404);
    expect(madeUpFetch.status).toBe(404);
    expect(await crossFetch.text()).toBe(await madeUpFetch.text());

    const crossPatch = await patchVehicle(other.cookie, created.id, { name: "Hijacked" });
    expect(crossPatch.status).toBe(404);

    const crossDelete = await deleteVehicleReq(other.cookie, created.id);
    expect(crossDelete.status).toBe(404);

    // Sanity check: the owner still has it, untouched.
    const ownRes = await getVehicle(owner.cookie, created.id);
    expect(ownRes.status).toBe(200);
    expect(((await ownRes.json()) as { name: string }).name).toBe("Owner's Car");
  });

  it("rejects an invalid PATCH value and applies no change (FR-009 analog for PATCH)", async () => {
    const { cookie } = await createSession();
    const created = (await (await createVehicle(cookie, {
      name: "Stable",
      odometerUnit: "km",
      year: 2021,
    })).json()) as Record<string, unknown>;

    const badYear = await patchVehicle(cookie, created.id as string, { year: 1500 });
    expect(badYear.status).toBe(400);

    const badUnit = await patchVehicle(cookie, created.id as string, { odometerUnit: "furlongs" });
    expect(badUnit.status).toBe(400);

    const after = (await (await getVehicle(cookie, created.id as string)).json()) as Record<
      string,
      unknown
    >;
    expect(after).toEqual(created);
  });
});

describe("vehicle deletion (User Story 3)", () => {
  it("a deleted vehicle is unreachable from the list and by id immediately (SC-004)", async () => {
    const { cookie } = await createSession();
    const created = (await (await createVehicle(cookie, {
      name: "To Delete",
      odometerUnit: "km",
    })).json()) as { id: string };

    const del = await deleteVehicleReq(cookie, created.id);
    expect(del.status).toBe(204);

    const fetchAfter = await getVehicle(cookie, created.id);
    expect(fetchAfter.status).toBe(404);

    const listAfter = (await (await listVehicles(cookie)).json()) as { vehicles: { id: string }[] };
    expect(listAfter.vehicles.some((v) => v.id === created.id)).toBe(false);
  });

  it("refuses to delete a different tenant's vehicle and leaves it intact", async () => {
    const owner = await createSession();
    const other = await createSession();
    const created = (await (await createVehicle(owner.cookie, {
      name: "Protected",
      odometerUnit: "km",
    })).json()) as { id: string };

    const crossDelete = await deleteVehicleReq(other.cookie, created.id);
    expect(crossDelete.status).toBe(404);

    const ownFetch = await getVehicle(owner.cookie, created.id);
    expect(ownFetch.status).toBe(200);
  });
});
it("exposes hasPhoto (never the raw photoR2Key/photoContentType) across create/list/get/patch", async () => {
  const { cookie } = await createSession();
  const created = (await (await createVehicle(cookie, { name: "No Photo", odometerUnit: "km" }))
    .json()) as Record<string, unknown>;
  expect(created.hasPhoto).toBe(false);
  expect(created.photoR2Key).toBeUndefined();
  expect(created.photoContentType).toBeUndefined();

  const listRes = await listVehicles(cookie);
  const { vehicles } = (await listRes.json()) as { vehicles: Array<Record<string, unknown>> };
  const listed = vehicles.find((v) => v.id === created.id);
  expect(listed?.hasPhoto).toBe(false);
  expect(listed?.photoR2Key).toBeUndefined();

  const getRes = await SELF.fetch(`https://example.com/api/v1/vehicles/${created.id}`, {
    headers: { Cookie: cookie },
  });
  expect(((await getRes.json()) as Record<string, unknown>).hasPhoto).toBe(false);

  const patchRes = await SELF.fetch(`https://example.com/api/v1/vehicles/${created.id}`, {
    method: "PATCH",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Still No Photo" }),
  });
  expect(((await patchRes.json()) as Record<string, unknown>).hasPhoto).toBe(false);
});
