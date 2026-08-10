import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
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

function getServiceRecord(cookie: string, id: string): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/service-records/${id}`, {
    headers: { Cookie: cookie },
  });
}

function patchServiceRecord(
  cookie: string,
  id: string,
  body: ServiceRecordBody,
): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/service-records/${id}`, {
    method: "PATCH",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteServiceRecordReq(cookie: string, id: string): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/service-records/${id}`, {
    method: "DELETE",
    headers: { Cookie: cookie },
  });
}

function uploadAttachment(
  cookie: string,
  serviceRecordId: string,
  bytes: Uint8Array,
  contentType = "application/octet-stream",
): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/service-records/${serviceRecordId}/attachments`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": contentType },
    body: bytes,
  });
}

function downloadAttachment(
  cookie: string,
  serviceRecordId: string,
  attachmentId: string,
): Promise<Response> {
  return SELF.fetch(
    `https://example.com/api/v1/service-records/${serviceRecordId}/attachments/${attachmentId}`,
    { headers: { Cookie: cookie } },
  );
}

async function createServiceRecordId(
  cookie: string,
  vehicleId: string,
  body: ServiceRecordBody = {},
): Promise<string> {
  const res = await createServiceRecord(cookie, vehicleId, {
    serviceDate: "2026-01-01",
    description: "Test record",
    ...body,
  });
  const created = (await res.json()) as { id: string };
  return created.id;
}

function dismissDuplicate(cookie: string, id: string): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/service-records/${id}/dismiss-duplicate`, {
    method: "POST",
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

describe("service record read (User Story 2)", () => {
  it("lists only each tenant's own vehicle's service records", async () => {
    const tenantA = await createSession();
    const tenantB = await createSession();
    const vehicleA = await createVehicleId(tenantA.cookie);
    const vehicleB = await createVehicleId(tenantB.cookie);

    await createServiceRecord(tenantA.cookie, vehicleA, {
      serviceDate: "2026-01-01",
      description: "A's record",
    });
    await createServiceRecord(tenantB.cookie, vehicleB, {
      serviceDate: "2026-01-01",
      description: "B's record",
    });

    const listA = (await (await listServiceRecords(tenantA.cookie, vehicleA)).json()) as {
      serviceRecords: { description: string }[];
    };
    expect(listA.serviceRecords.map((r) => r.description)).toEqual(["A's record"]);
  });

  it("fetches a record by id with its full detail, including an empty attachments array", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const id = await createServiceRecordId(cookie, vehicleId, { description: "Fetch me" });

    const res = await getServiceRecord(cookie, id);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { description: string; attachments: unknown[] };
    expect(body.description).toBe("Fetch me");
    expect(body.attachments).toEqual([]);
    expect(body).not.toHaveProperty("r2Key");
  });

  it("refuses to list or fetch a different tenant's vehicle/record, identically to a made-up id (FR-007/SC-002)", async () => {
    const owner = await createSession();
    const other = await createSession();
    const vehicleId = await createVehicleId(owner.cookie);
    const id = await createServiceRecordId(owner.cookie, vehicleId);
    const madeUpId = crypto.randomUUID();

    const crossFetch = await getServiceRecord(other.cookie, id);
    const madeUpFetch = await getServiceRecord(other.cookie, madeUpId);
    expect(crossFetch.status).toBe(404);
    expect(madeUpFetch.status).toBe(404);
    expect(await crossFetch.text()).toBe(await madeUpFetch.text());

    const crossList = await listServiceRecords(other.cookie, vehicleId);
    const madeUpList = await listServiceRecords(other.cookie, crypto.randomUUID());
    expect(crossList.status).toBe(404);
    expect(madeUpList.status).toBe(404);
  });
});

describe("service record update/delete (User Story 3)", () => {
  it("updating one field leaves every other field unchanged", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const created = (await (await createServiceRecord(cookie, vehicleId, {
      serviceDate: "2026-01-01",
      description: "Original",
      odometerReading: 1000,
      cost: 50,
      notes: "Original notes",
    })).json()) as Record<string, unknown>;

    const patched = await patchServiceRecord(cookie, created.id as string, {
      description: "Updated",
    });
    expect(patched.status).toBe(200);
    const patchedBody = (await patched.json()) as Record<string, unknown>;

    expect(patchedBody.description).toBe("Updated");
    for (const field of ["serviceDate", "odometerReading", "cost", "notes"]) {
      expect(patchedBody[field]).toBe(created[field]);
    }
  });

  it("rejects an invalid PATCH field value and applies no change", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const id = await createServiceRecordId(cookie, vehicleId);

    const badDate = await patchServiceRecord(cookie, id, { serviceDate: "" });
    expect(badDate.status).toBe(400);

    const badCost = await patchServiceRecord(cookie, id, { cost: "expensive" });
    expect(badCost.status).toBe(400);

    const after = await getServiceRecord(cookie, id);
    expect(after.status).toBe(200);
  });

  it("a deleted record is unreachable from list/fetch immediately", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const id = await createServiceRecordId(cookie, vehicleId);

    const del = await deleteServiceRecordReq(cookie, id);
    expect(del.status).toBe(204);

    const fetchAfter = await getServiceRecord(cookie, id);
    expect(fetchAfter.status).toBe(404);

    const listAfter = (await (await listServiceRecords(cookie, vehicleId)).json()) as {
      serviceRecords: { id: string }[];
    };
    expect(listAfter.serviceRecords.some((r) => r.id === id)).toBe(false);
  });

  it("refuses to update or delete a different tenant's record and leaves it intact", async () => {
    const owner = await createSession();
    const other = await createSession();
    const vehicleId = await createVehicleId(owner.cookie);
    const id = await createServiceRecordId(owner.cookie, vehicleId, { description: "Protected" });

    const crossPatch = await patchServiceRecord(other.cookie, id, { description: "Hijacked" });
    expect(crossPatch.status).toBe(404);

    const crossDelete = await deleteServiceRecordReq(other.cookie, id);
    expect(crossDelete.status).toBe(404);

    const ownFetch = await getServiceRecord(owner.cookie, id);
    expect(ownFetch.status).toBe(200);
    expect(((await ownFetch.json()) as { description: string }).description).toBe("Protected");
  });
});

describe("service record attachments (User Story 4)", () => {
  it("uploading a valid JPEG (no EXIF) succeeds and appears on the record", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const recordId = await createServiceRecordId(cookie, vehicleId);
    const jpeg = buildFixtureJpeg({ includeExif: false });

    const res = await uploadAttachment(cookie, recordId, jpeg);
    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: string; contentType: string; size: number };
    expect(created.contentType).toBe("image/jpeg");

    const record = (await (await getServiceRecord(cookie, recordId)).json()) as {
      attachments: { id: string }[];
    };
    expect(record.attachments.some((a) => a.id === created.id)).toBe(true);
  });

  it("rejects a body whose magic bytes don't match any allowed format, even with a spoofed Content-Type, and creates nothing (SC-003)", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const recordId = await createServiceRecordId(cookie, vehicleId);
    const notActuallyJpeg = new TextEncoder().encode("this is plain text, not an image");

    const res = await uploadAttachment(cookie, recordId, notActuallyJpeg, "image/jpeg");
    expect(res.status).toBe(400);

    const record = (await (await getServiceRecord(cookie, recordId)).json()) as {
      attachments: unknown[];
    };
    expect(record.attachments.length).toBe(0);
  });

  it("rejects a body larger than the 10MB size cap and creates nothing (SC-004)", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const recordId = await createServiceRecordId(cookie, vehicleId);
    const tooLarge = new Uint8Array(10 * 1024 * 1024 + 1);
    tooLarge.set([0xff, 0xd8, 0xff], 0); // valid JPEG magic bytes — size is the only problem

    const res = await uploadAttachment(cookie, recordId, tooLarge);
    expect(res.status).toBe(400);

    const record = (await (await getServiceRecord(cookie, recordId)).json()) as {
      attachments: unknown[];
    };
    expect(record.attachments.length).toBe(0);
  });

  it("strips the EXIF/GPS segment from an uploaded JPEG before storing it (SC-005)", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const recordId = await createServiceRecordId(cookie, vehicleId);
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
    const recordId = await createServiceRecordId(owner.cookie, vehicleId);
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

describe("vehicle deletion cleans up R2 attachments (retrofit, research.md)", () => {
  it("deleting a vehicle removes its service record's attachment from R2, not just D1", async () => {
    const { cookie, tenantId } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const recordId = await createServiceRecordId(cookie, vehicleId);
    const created = (await (await uploadAttachment(
      cookie,
      recordId,
      buildFixtureJpeg({ includeExif: false }),
    )).json()) as { id: string };

    const key = attachmentKey(tenantId, "service-records", recordId, created.id);
    expect(await env.ATTACHMENTS.get(key)).not.toBeNull();

    const del = await deleteVehicleReq(cookie, vehicleId);
    expect(del.status).toBe(204);

    expect(await env.ATTACHMENTS.get(key)).toBeNull();
  });
});

describe("service record semantic duplicate detection & resolution (constitution D-005)", () => {
  // Rate-limited session creation (30/window/IP — src/server/auth/rate-limit.ts) is shared across
  // every request in this file's single execution window (see spec 010's fuel-record test file
  // for the same pattern), so these tests share one session wherever tenant isolation isn't the
  // thing being tested, and use a fresh vehicle per test to avoid cross-test duplicate-detection
  // pollution.
  let sharedCookie: string;

  beforeAll(async () => {
    sharedCookie = (await createSession()).cookie;
  });

  it("flags a same-date, same-description second record as a possible duplicate, without touching the original", async () => {
    const vehicleId = await createVehicleId(sharedCookie);

    const first = (await (await createServiceRecord(sharedCookie, vehicleId, {
      serviceDate: "2026-01-01",
      description: "Oil change",
    })).json()) as { id: string; duplicateOfId: string | null };
    expect(first.duplicateOfId).toBeNull();

    const second = (await (await createServiceRecord(sharedCookie, vehicleId, {
      serviceDate: "2026-01-01",
      description: "OIL CHANGE",
    })).json()) as { duplicateOfId: string | null };
    expect(second.duplicateOfId).toBe(first.id);

    // The original is untouched — still present, still fetchable, still unflagged (FR-004).
    const refetchedFirst = (await (await getServiceRecord(sharedCookie, first.id)).json()) as {
      description: string;
      duplicateOfId: string | null;
    };
    expect(refetchedFirst.description).toBe("Oil change");
    expect(refetchedFirst.duplicateOfId).toBeNull();
  });

  it("does not flag a meaningfully different second record", async () => {
    const vehicleId = await createVehicleId(sharedCookie);

    await createServiceRecord(sharedCookie, vehicleId, {
      serviceDate: "2026-01-01",
      description: "Oil change",
    });

    const differentDate = (await (await createServiceRecord(sharedCookie, vehicleId, {
      serviceDate: "2026-01-15",
      description: "Oil change",
    })).json()) as { duplicateOfId: string | null };
    expect(differentDate.duplicateOfId).toBeNull();

    const differentDescription = (await (await createServiceRecord(sharedCookie, vehicleId, {
      serviceDate: "2026-01-01",
      description: "Brake pads replaced",
    })).json()) as { duplicateOfId: string | null };
    expect(differentDescription.duplicateOfId).toBeNull();
  });

  it("never compares across tenants or across different vehicles", async () => {
    const other = await createSession();
    const ownVehicle = await createVehicleId(sharedCookie);
    const otherVehicle = await createVehicleId(other.cookie);
    const secondOwnVehicle = await createVehicleId(sharedCookie);

    await createServiceRecord(sharedCookie, ownVehicle, {
      serviceDate: "2026-01-01",
      description: "Oil change",
    });

    const crossTenant = (await (await createServiceRecord(other.cookie, otherVehicle, {
      serviceDate: "2026-01-01",
      description: "Oil change",
    })).json()) as { duplicateOfId: string | null };
    expect(crossTenant.duplicateOfId).toBeNull();

    const differentVehicle = (await (await createServiceRecord(sharedCookie, secondOwnVehicle, {
      serviceDate: "2026-01-01",
      description: "Oil change",
    })).json()) as { duplicateOfId: string | null };
    expect(differentVehicle.duplicateOfId).toBeNull();
  });

  it("dismissing a flag clears it", async () => {
    const vehicleId = await createVehicleId(sharedCookie);

    const first = (await (await createServiceRecord(sharedCookie, vehicleId, {
      serviceDate: "2026-01-01",
      description: "Oil change",
    })).json()) as { id: string };
    const second = (await (await createServiceRecord(sharedCookie, vehicleId, {
      serviceDate: "2026-01-01",
      description: "Oil change",
    })).json()) as { id: string; duplicateOfId: string | null };
    expect(second.duplicateOfId).toBe(first.id);

    const dismissRes = await dismissDuplicate(sharedCookie, second.id);
    expect(dismissRes.status).toBe(200);
    const dismissed = (await dismissRes.json()) as { duplicateOfId: string | null };
    expect(dismissed.duplicateOfId).toBeNull();

    const refetched = (await (await getServiceRecord(sharedCookie, second.id)).json()) as {
      duplicateOfId: string | null;
    };
    expect(refetched.duplicateOfId).toBeNull();
  });

  it("refuses to dismiss an already-unflagged record, a made-up id, or a different tenant's record", async () => {
    const other = await createSession();
    const vehicleId = await createVehicleId(sharedCookie);
    const unflagged = await createServiceRecordId(sharedCookie, vehicleId);

    const notFlagged = await dismissDuplicate(sharedCookie, unflagged);
    expect(notFlagged.status).toBe(404);

    const madeUp = await dismissDuplicate(sharedCookie, crypto.randomUUID());
    expect(madeUp.status).toBe(404);

    await createServiceRecord(sharedCookie, vehicleId, {
      serviceDate: "2026-03-01",
      description: "Tire rotation",
    });
    const second = (await (await createServiceRecord(sharedCookie, vehicleId, {
      serviceDate: "2026-03-01",
      description: "Tire rotation",
    })).json()) as { id: string };

    const crossTenant = await dismissDuplicate(other.cookie, second.id);
    expect(crossTenant.status).toBe(404);
  });

  it("deleting the original record of a still-flagged pair clears the flag on the remaining record", async () => {
    const vehicleId = await createVehicleId(sharedCookie);

    const original = (await (await createServiceRecord(sharedCookie, vehicleId, {
      serviceDate: "2026-01-01",
      description: "Oil change",
    })).json()) as { id: string };
    const flagged = (await (await createServiceRecord(sharedCookie, vehicleId, {
      serviceDate: "2026-01-01",
      description: "Oil change",
    })).json()) as { id: string; duplicateOfId: string | null };
    expect(flagged.duplicateOfId).toBe(original.id);

    const del = await deleteServiceRecordReq(sharedCookie, original.id);
    expect(del.status).toBe(204);

    const refetchedFlagged = (await (await getServiceRecord(sharedCookie, flagged.id)).json()) as {
      duplicateOfId: string | null;
    };
    expect(refetchedFlagged.duplicateOfId).toBeNull();
  });

  it("still flags a duplicate when both creates race concurrently (issue #45)", async () => {
    // A dedicated session, not sharedCookie — this describe block's many earlier creates can
    // exhaust sharedCookie's rate-limit window (src/server/auth/rate-limit.ts) by the time this
    // test runs, and a 429 on either racing request would otherwise be misread as "both flagged."
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);

    const [firstRes, secondRes] = await Promise.all([
      createServiceRecord(cookie, vehicleId, {
        serviceDate: "2026-01-01",
        description: "Oil change",
      }),
      createServiceRecord(cookie, vehicleId, {
        serviceDate: "2026-01-01",
        description: "Oil change",
      }),
    ]);
    expect(firstRes.status).toBe(201);
    expect(secondRes.status).toBe(201);
    const first = (await firstRes.json()) as { id: string; duplicateOfId: string | null };
    const second = (await secondRes.json()) as { id: string; duplicateOfId: string | null };

    // Exactly one of the two is the original (duplicateOfId: null) and the other points at it —
    // never both null (the pre-fix race) and never a cycle.
    const flagged = [first, second].filter((r) => r.duplicateOfId !== null);
    const originals = [first, second].filter((r) => r.duplicateOfId === null);
    expect(originals.length).toBe(1);
    expect(flagged.length).toBe(1);
    expect(flagged[0]?.duplicateOfId).toBe(originals[0]?.id);
  });
});
