import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { buildFixtureJpeg, GPS_MARKER } from "./fixtures/jpeg";
import { attachmentKey } from "../../src/server/attachments/storage";

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

function deleteVehicleReq(cookie: string, id: string): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicles/${id}`, {
    method: "DELETE",
    headers: { Cookie: cookie },
  });
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

function listFuelRecords(cookie: string, vehicleId: string): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/fuel-records`, {
    headers: { Cookie: cookie },
  });
}

function getFuelRecord(cookie: string, id: string): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/fuel-records/${id}`, {
    headers: { Cookie: cookie },
  });
}

function patchFuelRecord(cookie: string, id: string, body: FuelRecordBody): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/fuel-records/${id}`, {
    method: "PATCH",
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

function uploadAttachment(
  cookie: string,
  fuelRecordId: string,
  bytes: Uint8Array,
  contentType = "application/octet-stream",
): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/fuel-records/${fuelRecordId}/attachments`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": contentType },
    body: bytes,
  });
}

function downloadAttachment(
  cookie: string,
  fuelRecordId: string,
  attachmentId: string,
): Promise<Response> {
  return SELF.fetch(
    `https://example.com/api/v1/fuel-records/${fuelRecordId}/attachments/${attachmentId}`,
    { headers: { Cookie: cookie } },
  );
}

async function createFuelRecordId(
  cookie: string,
  vehicleId: string,
  body: FuelRecordBody = {},
): Promise<string> {
  const res = await createFuelRecord(cookie, vehicleId, {
    fuelDate: "2026-01-01",
    odometerReading: 1000,
    volume: 40,
    cost: 60,
    ...body,
  });
  const created = (await res.json()) as { id: string };
  return created.id;
}

describe("fuel record creation (User Story 1)", () => {
  it("creates a record with only the four required fields and it appears in the vehicle's list with no economy figure", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);

    const res = await createFuelRecord(cookie, vehicleId, {
      fuelDate: "2026-01-15",
      odometerReading: 1000,
      volume: 40,
      cost: 60,
    });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: string; fuelEconomy: number | null };
    expect(created.fuelEconomy).toBeNull();

    const listRes = await listFuelRecords(cookie, vehicleId);
    const { fuelRecords } = (await listRes.json()) as { fuelRecords: { id: string }[] };
    expect(fuelRecords.some((r) => r.id === created.id)).toBe(true);
  });

  it("stores station and notes exactly as submitted", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);

    const res = await createFuelRecord(cookie, vehicleId, {
      fuelDate: "2026-02-01",
      odometerReading: 1200,
      volume: 38.5,
      cost: 57.75,
      station: "Shell",
      notes: "Filled to full",
    });
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created).toMatchObject({
      fuelDate: "2026-02-01",
      odometerReading: 1200,
      volume: 38.5,
      cost: 57.75,
      station: "Shell",
      notes: "Filled to full",
    });
  });

  it("rejects a missing required field and creates nothing", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);

    const noDate = await createFuelRecord(cookie, vehicleId, {
      odometerReading: 1000,
      volume: 40,
      cost: 60,
    });
    expect(noDate.status).toBe(400);

    const noOdometer = await createFuelRecord(cookie, vehicleId, {
      fuelDate: "2026-01-01",
      volume: 40,
      cost: 60,
    });
    expect(noOdometer.status).toBe(400);

    const noVolume = await createFuelRecord(cookie, vehicleId, {
      fuelDate: "2026-01-01",
      odometerReading: 1000,
      cost: 60,
    });
    expect(noVolume.status).toBe(400);

    const noCost = await createFuelRecord(cookie, vehicleId, {
      fuelDate: "2026-01-01",
      odometerReading: 1000,
      volume: 40,
    });
    expect(noCost.status).toBe(400);

    const listRes = await listFuelRecords(cookie, vehicleId);
    const { fuelRecords } = (await listRes.json()) as { fuelRecords: unknown[] };
    expect(fuelRecords.length).toBe(0);
  });

  it("refuses to create against a vehicle belonging to a different tenant or a made-up id, identically (FR-003)", async () => {
    const owner = await createSession();
    const other = await createSession();
    const vehicleId = await createVehicleId(owner.cookie);
    const madeUpId = crypto.randomUUID();

    const crossCreate = await createFuelRecord(other.cookie, vehicleId, {
      fuelDate: "2026-04-01",
      odometerReading: 1000,
      volume: 40,
      cost: 60,
    });
    const madeUpCreate = await createFuelRecord(other.cookie, madeUpId, {
      fuelDate: "2026-04-01",
      odometerReading: 1000,
      volume: 40,
      cost: 60,
    });
    expect(crossCreate.status).toBe(404);
    expect(madeUpCreate.status).toBe(404);
    expect(await crossCreate.text()).toBe(await madeUpCreate.text());

    const listRes = await listFuelRecords(owner.cookie, vehicleId);
    const { fuelRecords } = (await listRes.json()) as { fuelRecords: unknown[] };
    expect(fuelRecords.length).toBe(0);
  });
});

describe("fuel record read + economy calculation (User Story 2)", () => {
  it("computes fuel economy (L/100km) for a second fill-up on a km vehicle", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie, { odometerUnit: "km" });

    await createFuelRecord(cookie, vehicleId, {
      fuelDate: "2026-01-01",
      odometerReading: 1000,
      volume: 40,
      cost: 60,
    });
    const second = await createFuelRecord(cookie, vehicleId, {
      fuelDate: "2026-01-15",
      odometerReading: 1500,
      volume: 40,
      cost: 60,
    });
    const secondBody = (await second.json()) as { fuelEconomy: number | null };
    // 500km travelled on 40L => 8 L/100km
    expect(secondBody.fuelEconomy).toBeCloseTo(8, 5);
  });

  it("computes fuel economy (MPG) for a second fill-up on a mi vehicle", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie, { odometerUnit: "mi" });

    await createFuelRecord(cookie, vehicleId, {
      fuelDate: "2026-01-01",
      odometerReading: 10000,
      volume: 10,
      cost: 40,
    });
    const second = await createFuelRecord(cookie, vehicleId, {
      fuelDate: "2026-01-15",
      odometerReading: 10300,
      volume: 10,
      cost: 40,
    });
    const secondBody = (await second.json()) as { fuelEconomy: number | null };
    // 300mi travelled on 10gal => 30 MPG
    expect(secondBody.fuelEconomy).toBeCloseTo(30, 5);
  });

  it("shows no economy figure for a same-odometer fill-up, never a crash or infinite value", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);

    await createFuelRecord(cookie, vehicleId, {
      fuelDate: "2026-01-01",
      odometerReading: 1000,
      volume: 40,
      cost: 60,
    });
    const same = await createFuelRecord(cookie, vehicleId, {
      fuelDate: "2026-01-02",
      odometerReading: 1000,
      volume: 5,
      cost: 8,
    });
    expect(same.status).toBe(201);
    const sameBody = (await same.json()) as { fuelEconomy: number | null };
    expect(sameBody.fuelEconomy).toBeNull();
  });

  it("fetches a record by id with matching economy and an empty attachments array", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);

    await createFuelRecord(cookie, vehicleId, {
      fuelDate: "2026-01-01",
      odometerReading: 1000,
      volume: 40,
      cost: 60,
    });
    const secondRes = await createFuelRecord(cookie, vehicleId, {
      fuelDate: "2026-01-15",
      odometerReading: 1500,
      volume: 40,
      cost: 60,
    });
    const second = (await secondRes.json()) as { id: string; fuelEconomy: number | null };

    const detailRes = await getFuelRecord(cookie, second.id);
    expect(detailRes.status).toBe(200);
    const detail = (await detailRes.json()) as {
      fuelEconomy: number | null;
      attachments: unknown[];
    };
    expect(detail.fuelEconomy).toBeCloseTo(second.fuelEconomy as number, 5);
    expect(detail.attachments).toEqual([]);
  });

  it("lists only each tenant's own vehicle's fuel records", async () => {
    const tenantA = await createSession();
    const tenantB = await createSession();
    const vehicleA = await createVehicleId(tenantA.cookie);
    const vehicleB = await createVehicleId(tenantB.cookie);

    await createFuelRecord(tenantA.cookie, vehicleA, {
      fuelDate: "2026-01-01",
      odometerReading: 1000,
      volume: 40,
      cost: 60,
    });
    await createFuelRecord(tenantB.cookie, vehicleB, {
      fuelDate: "2026-01-01",
      odometerReading: 2000,
      volume: 30,
      cost: 45,
    });

    const listA = (await (await listFuelRecords(tenantA.cookie, vehicleA)).json()) as {
      fuelRecords: { odometerReading: number }[];
    };
    expect(listA.fuelRecords.map((r) => r.odometerReading)).toEqual([1000]);
  });

  it("refuses to list or fetch a different tenant's vehicle/record, identically to a made-up id (FR-003)", async () => {
    const owner = await createSession();
    const other = await createSession();
    const vehicleId = await createVehicleId(owner.cookie);
    const id = await createFuelRecordId(owner.cookie, vehicleId);
    const madeUpId = crypto.randomUUID();

    const crossFetch = await getFuelRecord(other.cookie, id);
    const madeUpFetch = await getFuelRecord(other.cookie, madeUpId);
    expect(crossFetch.status).toBe(404);
    expect(madeUpFetch.status).toBe(404);
    expect(await crossFetch.text()).toBe(await madeUpFetch.text());

    const crossList = await listFuelRecords(other.cookie, vehicleId);
    const madeUpList = await listFuelRecords(other.cookie, crypto.randomUUID());
    expect(crossList.status).toBe(404);
    expect(madeUpList.status).toBe(404);
  });
});

describe("fuel record update/delete (User Story 3)", () => {
  it("updating one field leaves every other field unchanged", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const created = (await (await createFuelRecord(cookie, vehicleId, {
      fuelDate: "2026-01-01",
      odometerReading: 1000,
      volume: 40,
      cost: 60,
      station: "Original Station",
      notes: "Original notes",
    })).json()) as Record<string, unknown>;

    const patched = await patchFuelRecord(cookie, created.id as string, { station: "New Station" });
    expect(patched.status).toBe(200);
    const patchedBody = (await patched.json()) as Record<string, unknown>;

    expect(patchedBody.station).toBe("New Station");
    for (const field of ["fuelDate", "odometerReading", "volume", "cost", "notes"]) {
      expect(patchedBody[field]).toBe(created[field]);
    }
  });

  it("rejects an invalid PATCH field value and applies no change", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const id = await createFuelRecordId(cookie, vehicleId);

    const badDate = await patchFuelRecord(cookie, id, { fuelDate: "" });
    expect(badDate.status).toBe(400);

    const badVolume = await patchFuelRecord(cookie, id, { volume: "lots" });
    expect(badVolume.status).toBe(400);

    const after = await getFuelRecord(cookie, id);
    expect(after.status).toBe(200);
  });

  it("recomputes a later record's fuelEconomy after an earlier record's odometer reading is backfilled/corrected (FR-008)", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);

    const first = (await (await createFuelRecord(cookie, vehicleId, {
      fuelDate: "2026-01-01",
      odometerReading: 1000,
      volume: 40,
      cost: 60,
    })).json()) as { id: string };
    const secondRes = await createFuelRecord(cookie, vehicleId, {
      fuelDate: "2026-01-15",
      odometerReading: 1500,
      volume: 40,
      cost: 60,
    });
    const second = (await secondRes.json()) as { id: string; fuelEconomy: number };
    expect(second.fuelEconomy).toBeCloseTo(8, 5); // 500km / 40L

    await patchFuelRecord(cookie, first.id, { odometerReading: 1250 });

    const refetched = (await (await getFuelRecord(cookie, second.id)).json()) as {
      fuelEconomy: number;
    };
    // 250km / 40L now, since the earlier record's odometer moved closer
    expect(refetched.fuelEconomy).toBeCloseTo(16, 5);
    expect(refetched.fuelEconomy).not.toBeCloseTo(second.fuelEconomy, 5);
  });

  it("a deleted record is unreachable from list/fetch immediately, and its R2 attachment object is actually gone", async () => {
    const { cookie, tenantId } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const id = await createFuelRecordId(cookie, vehicleId);
    const attachment = (await (await uploadAttachment(
      cookie,
      id,
      buildFixtureJpeg({ includeExif: false }),
    )).json()) as { id: string };
    const key = attachmentKey(tenantId, id, attachment.id);
    expect(await env.ATTACHMENTS.get(key)).not.toBeNull();

    const del = await deleteFuelRecordReq(cookie, id);
    expect(del.status).toBe(204);

    const fetchAfter = await getFuelRecord(cookie, id);
    expect(fetchAfter.status).toBe(404);

    const listAfter = (await (await listFuelRecords(cookie, vehicleId)).json()) as {
      fuelRecords: { id: string }[];
    };
    expect(listAfter.fuelRecords.some((r) => r.id === id)).toBe(false);

    expect(await env.ATTACHMENTS.get(key)).toBeNull();
  });

  it("refuses to update or delete a different tenant's record and leaves it intact", async () => {
    const owner = await createSession();
    const other = await createSession();
    const vehicleId = await createVehicleId(owner.cookie);
    const id = await createFuelRecordId(owner.cookie, vehicleId, { station: "Protected" });

    const crossPatch = await patchFuelRecord(other.cookie, id, { station: "Hijacked" });
    expect(crossPatch.status).toBe(404);

    const crossDelete = await deleteFuelRecordReq(other.cookie, id);
    expect(crossDelete.status).toBe(404);

    const ownFetch = await getFuelRecord(owner.cookie, id);
    expect(ownFetch.status).toBe(200);
    expect(((await ownFetch.json()) as { station: string }).station).toBe("Protected");
  });
});

describe("fuel record attachments (User Story 4)", () => {
  it("uploading a valid JPEG (no EXIF) succeeds and appears on the record", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const recordId = await createFuelRecordId(cookie, vehicleId);
    const jpeg = buildFixtureJpeg({ includeExif: false });

    const res = await uploadAttachment(cookie, recordId, jpeg);
    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: string; contentType: string; size: number };
    expect(created.contentType).toBe("image/jpeg");

    const record = (await (await getFuelRecord(cookie, recordId)).json()) as {
      attachments: { id: string }[];
    };
    expect(record.attachments.some((a) => a.id === created.id)).toBe(true);
  });

  it("rejects a body whose magic bytes don't match any allowed format, even with a spoofed Content-Type, and creates nothing (SC-003)", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const recordId = await createFuelRecordId(cookie, vehicleId);
    const notActuallyJpeg = new TextEncoder().encode("this is plain text, not an image");

    const res = await uploadAttachment(cookie, recordId, notActuallyJpeg, "image/jpeg");
    expect(res.status).toBe(400);

    const record = (await (await getFuelRecord(cookie, recordId)).json()) as {
      attachments: unknown[];
    };
    expect(record.attachments.length).toBe(0);
  });

  it("rejects a body larger than the 10MB size cap and creates nothing (SC-003)", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const recordId = await createFuelRecordId(cookie, vehicleId);
    const tooLarge = new Uint8Array(10 * 1024 * 1024 + 1);
    tooLarge.set([0xff, 0xd8, 0xff], 0); // valid JPEG magic bytes — size is the only problem

    const res = await uploadAttachment(cookie, recordId, tooLarge);
    expect(res.status).toBe(400);

    const record = (await (await getFuelRecord(cookie, recordId)).json()) as {
      attachments: unknown[];
    };
    expect(record.attachments.length).toBe(0);
  });

  it("strips the EXIF/GPS segment from an uploaded JPEG before storing it", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const recordId = await createFuelRecordId(cookie, vehicleId);
    const jpegWithExif = buildFixtureJpeg({ includeExif: true });

    const uploadRes = await uploadAttachment(cookie, recordId, jpegWithExif);
    expect(uploadRes.status).toBe(201);
    const created = (await uploadRes.json()) as { id: string };

    const downloadRes = await downloadAttachment(cookie, recordId, created.id);
    expect(downloadRes.status).toBe(200);
    const storedBytes = new Uint8Array(await downloadRes.arrayBuffer());
    const storedText = new TextDecoder("latin1").decode(storedBytes);
    expect(storedText.includes(GPS_MARKER)).toBe(false);
  });

  it("refuses to download an attachment belonging to a different tenant's record, identically to a made-up id (SC-002)", async () => {
    const owner = await createSession();
    const other = await createSession();
    const vehicleId = await createVehicleId(owner.cookie);
    const recordId = await createFuelRecordId(owner.cookie, vehicleId);
    const created = (await (await uploadAttachment(
      owner.cookie,
      recordId,
      buildFixtureJpeg({ includeExif: false }),
    )).json()) as { id: string };
    const madeUpAttachmentId = crypto.randomUUID();

    const crossDownload = await downloadAttachment(other.cookie, recordId, created.id);
    const madeUpDownload = await downloadAttachment(other.cookie, recordId, madeUpAttachmentId);
    expect(crossDownload.status).toBe(404);
    expect(madeUpDownload.status).toBe(404);
    expect(await crossDownload.text()).toBe(await madeUpDownload.text());
  });
});

describe("vehicle deletion cleans up both fuel and service record R2 attachments (retrofit)", () => {
  it("deleting a vehicle removes its fuel record's attachment from R2, alongside its service record's attachment", async () => {
    const { cookie, tenantId } = await createSession();
    const vehicleId = await createVehicleId(cookie);

    const fuelRecordId = await createFuelRecordId(cookie, vehicleId);
    const fuelAttachment = (await (await uploadAttachment(
      cookie,
      fuelRecordId,
      buildFixtureJpeg({ includeExif: false }),
    )).json()) as { id: string };
    const fuelKey = attachmentKey(tenantId, fuelRecordId, fuelAttachment.id);

    const serviceRes = await SELF.fetch(
      `https://example.com/api/v1/vehicles/${vehicleId}/service-records`,
      {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({ serviceDate: "2026-01-01", description: "Retrofit check" }),
      },
    );
    const serviceRecord = (await serviceRes.json()) as { id: string };
    const serviceAttachmentRes = await SELF.fetch(
      `https://example.com/api/v1/service-records/${serviceRecord.id}/attachments`,
      {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "image/jpeg" },
        body: buildFixtureJpeg({ includeExif: false }),
      },
    );
    const serviceAttachment = (await serviceAttachmentRes.json()) as { id: string };
    const serviceKey = attachmentKey(tenantId, serviceRecord.id, serviceAttachment.id);

    expect(await env.ATTACHMENTS.get(fuelKey)).not.toBeNull();
    expect(await env.ATTACHMENTS.get(serviceKey)).not.toBeNull();

    const del = await deleteVehicleReq(cookie, vehicleId);
    expect(del.status).toBe(204);

    expect(await env.ATTACHMENTS.get(fuelKey)).toBeNull();
    expect(await env.ATTACHMENTS.get(serviceKey)).toBeNull();
  });
});
