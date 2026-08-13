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

type DocumentBody = {
  title?: unknown;
  category?: unknown;
  expiryDate?: unknown;
  notes?: unknown;
};

function createDocument(cookie: string, vehicleId: string, body: DocumentBody): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/documents`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function listDocuments(cookie: string, vehicleId: string): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/documents`, {
    headers: { Cookie: cookie },
  });
}

function getDocument(cookie: string, id: string): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/documents/${id}`, {
    headers: { Cookie: cookie },
  });
}

function patchDocument(cookie: string, id: string, body: DocumentBody): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/documents/${id}`, {
    method: "PATCH",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteDocumentReq(cookie: string, id: string): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/documents/${id}`, {
    method: "DELETE",
    headers: { Cookie: cookie },
  });
}

function uploadAttachment(
  cookie: string,
  documentId: string,
  bytes: Uint8Array,
  contentType = "application/octet-stream",
): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/documents/${documentId}/attachments`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": contentType },
    body: bytes,
  });
}

function downloadAttachment(
  cookie: string,
  documentId: string,
  attachmentId: string,
): Promise<Response> {
  return SELF.fetch(
    `https://example.com/api/v1/documents/${documentId}/attachments/${attachmentId}`,
    { headers: { Cookie: cookie } },
  );
}

async function createDocumentId(
  cookie: string,
  vehicleId: string,
  body: DocumentBody = {},
): Promise<string> {
  const res = await createDocument(cookie, vehicleId, {
    title: "Test document",
    category: "registration",
    ...body,
  });
  const created = (await res.json()) as { id: string };
  return created.id;
}

describe("document creation (User Story 1)", () => {
  it("creates a document with only the two required fields and it appears in the vehicle's list, not expired", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);

    const res = await createDocument(cookie, vehicleId, {
      title: "Registration",
      category: "registration",
    });
    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: string; title: string; isExpired: boolean };
    expect(created.title).toBe("Registration");
    expect(created.isExpired).toBe(false);

    const listRes = await listDocuments(cookie, vehicleId);
    const { documents } = (await listRes.json()) as { documents: { id: string }[] };
    expect(documents.some((d) => d.id === created.id)).toBe(true);
  });

  it("stores every optional field exactly as submitted", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);

    const res = await createDocument(cookie, vehicleId, {
      title: "Insurance policy",
      category: "insurance",
      expiryDate: "2099-01-01",
      notes: "Comprehensive coverage",
    });
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created).toMatchObject({
      title: "Insurance policy",
      category: "insurance",
      expiryDate: "2099-01-01",
      notes: "Comprehensive coverage",
    });
  });

  it("omitting the expiry date creates the document with no expiry, never inferred", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);

    const res = await createDocument(cookie, vehicleId, {
      title: "Vehicle title",
      category: "other",
    });
    const created = (await res.json()) as { expiryDate: string | null; isExpired: boolean };
    expect(created.expiryDate).toBeNull();
    expect(created.isExpired).toBe(false);
  });

  it("rejects a missing title or category and creates nothing", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);

    const noTitle = await createDocument(cookie, vehicleId, { category: "registration" });
    expect(noTitle.status).toBe(400);

    const noCategory = await createDocument(cookie, vehicleId, { title: "No category" });
    expect(noCategory.status).toBe(400);

    const listRes = await listDocuments(cookie, vehicleId);
    const { documents } = (await listRes.json()) as { documents: unknown[] };
    expect(documents.length).toBe(0);
  });

  it("rejects a category outside the defined set and creates nothing (FR-002)", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);

    const res = await createDocument(cookie, vehicleId, {
      title: "Bogus",
      category: "not-a-real-category",
    });
    expect(res.status).toBe(400);

    const listRes = await listDocuments(cookie, vehicleId);
    const { documents } = (await listRes.json()) as { documents: unknown[] };
    expect(documents.length).toBe(0);
  });

  it("refuses to create against a vehicle belonging to a different tenant or a made-up id, identically (FR-004)", async () => {
    const owner = await createSession();
    const other = await createSession();
    const vehicleId = await createVehicleId(owner.cookie);
    const madeUpId = crypto.randomUUID();

    const crossCreate = await createDocument(other.cookie, vehicleId, {
      title: "Should fail",
      category: "other",
    });
    const madeUpCreate = await createDocument(other.cookie, madeUpId, {
      title: "Should fail",
      category: "other",
    });
    expect(crossCreate.status).toBe(404);
    expect(madeUpCreate.status).toBe(404);
    expect(await crossCreate.text()).toBe(await madeUpCreate.text());

    const listRes = await listDocuments(owner.cookie, vehicleId);
    const { documents } = (await listRes.json()) as { documents: unknown[] };
    expect(documents.length).toBe(0);
  });
});

describe("document read (User Story 2)", () => {
  it("lists only each tenant's own vehicle's documents", async () => {
    const tenantA = await createSession();
    const tenantB = await createSession();
    const vehicleA = await createVehicleId(tenantA.cookie);
    const vehicleB = await createVehicleId(tenantB.cookie);

    await createDocument(tenantA.cookie, vehicleA, { title: "A's document", category: "other" });
    await createDocument(tenantB.cookie, vehicleB, { title: "B's document", category: "other" });

    const listA = (await (await listDocuments(tenantA.cookie, vehicleA)).json()) as {
      documents: { title: string }[];
    };
    expect(listA.documents.map((d) => d.title)).toEqual(["A's document"]);
  });

  it("fetches a document by id with its full detail, including an empty attachments array", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const id = await createDocumentId(cookie, vehicleId, { title: "Fetch me" });

    const res = await getDocument(cookie, id);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { title: string; attachments: unknown[] };
    expect(body.title).toBe("Fetch me");
    expect(body.attachments).toEqual([]);
    expect(body).not.toHaveProperty("r2Key");
  });

  it("flags a document with a past expiry date as expired, and one with a future or absent expiry as not expired (SC-007)", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);

    const expiredId = await createDocumentId(cookie, vehicleId, {
      title: "Expired",
      expiryDate: "2000-01-01",
    });
    const futureId = await createDocumentId(cookie, vehicleId, {
      title: "Future",
      expiryDate: "2099-01-01",
    });
    const noExpiryId = await createDocumentId(cookie, vehicleId, { title: "No expiry" });

    type DocStatus = {
      isExpired: boolean;
      reminderStatus: string | null;
      windowFraction: number | null;
    };

    const expired = (await (await getDocument(cookie, expiredId)).json()) as DocStatus;
    const future = (await (await getDocument(cookie, futureId)).json()) as DocStatus;
    const noExpiry = (await (await getDocument(cookie, noExpiryId)).json()) as DocStatus;
    expect(expired.isExpired).toBe(true);
    expect(future.isExpired).toBe(false);
    expect(noExpiry.isExpired).toBe(false);

    // windowFraction (specs/045): 1 once overdue, null for on_track/no-expiry-date — never a
    // guessed percentage for a document with no fixed window to measure against.
    expect(expired.reminderStatus).toBe("overdue");
    expect(expired.windowFraction).toBe(1);
    expect(future.reminderStatus).toBe("on_track");
    expect(future.windowFraction).toBeNull();
    expect(noExpiry.reminderStatus).toBeNull();
    expect(noExpiry.windowFraction).toBeNull();

    // Still returned in full via the list too — never hidden for being expired.
    const list = (await (await listDocuments(cookie, vehicleId)).json()) as {
      documents: { id: string; isExpired: boolean }[];
    };
    expect(list.documents.find((d) => d.id === expiredId)?.isExpired).toBe(true);
  });

  it("computes a windowFraction between 0 and 1 for a document inside the coming-up window (specs/045)", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);

    // 10 days out, well inside the 30-day coming-up window.
    const soon = new Date();
    soon.setUTCDate(soon.getUTCDate() + 10);
    const comingUpId = await createDocumentId(cookie, vehicleId, {
      title: "Coming up",
      expiryDate: soon.toISOString().slice(0, 10),
    });

    const comingUp = (await (await getDocument(cookie, comingUpId)).json()) as {
      reminderStatus: string | null;
      windowFraction: number | null;
    };
    expect(comingUp.reminderStatus).toBe("coming_up");
    expect(comingUp.windowFraction).not.toBeNull();
    expect(comingUp.windowFraction as number).toBeGreaterThan(0);
    expect(comingUp.windowFraction as number).toBeLessThan(1);
  });

  it("refuses to list or fetch a different tenant's vehicle/document, identically to a made-up id", async () => {
    const owner = await createSession();
    const other = await createSession();
    const vehicleId = await createVehicleId(owner.cookie);
    const id = await createDocumentId(owner.cookie, vehicleId);
    const madeUpId = crypto.randomUUID();

    const crossFetch = await getDocument(other.cookie, id);
    const madeUpFetch = await getDocument(other.cookie, madeUpId);
    expect(crossFetch.status).toBe(404);
    expect(madeUpFetch.status).toBe(404);
    expect(await crossFetch.text()).toBe(await madeUpFetch.text());

    const crossList = await listDocuments(other.cookie, vehicleId);
    const madeUpList = await listDocuments(other.cookie, crypto.randomUUID());
    expect(crossList.status).toBe(404);
    expect(madeUpList.status).toBe(404);
  });
});

describe("document update/delete (User Story 3)", () => {
  it("updating one field leaves every other field unchanged", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const created = (await (await createDocument(cookie, vehicleId, {
      title: "Original",
      category: "insurance",
      expiryDate: "2099-01-01",
      notes: "Original notes",
    })).json()) as Record<string, unknown>;

    const patched = await patchDocument(cookie, created.id as string, { title: "Updated" });
    expect(patched.status).toBe(200);
    const patchedBody = (await patched.json()) as Record<string, unknown>;

    expect(patchedBody.title).toBe("Updated");
    for (const field of ["category", "expiryDate", "notes"]) {
      expect(patchedBody[field]).toBe(created[field]);
    }
  });

  it("rejects an invalid PATCH field value and applies no change", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const id = await createDocumentId(cookie, vehicleId);

    const badTitle = await patchDocument(cookie, id, { title: "" });
    expect(badTitle.status).toBe(400);

    const badCategory = await patchDocument(cookie, id, { category: "not-a-category" });
    expect(badCategory.status).toBe(400);

    const after = await getDocument(cookie, id);
    expect(after.status).toBe(200);
  });

  it("PATCH with expiryDate: null clears a previously-set expiry and flips isExpired to false", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const id = await createDocumentId(cookie, vehicleId, { expiryDate: "2000-01-01" });

    const before = (await (await getDocument(cookie, id)).json()) as { isExpired: boolean };
    expect(before.isExpired).toBe(true);

    const patched = await patchDocument(cookie, id, { expiryDate: null });
    expect(patched.status).toBe(200);
    const patchedBody = (await patched.json()) as { expiryDate: string | null; isExpired: boolean };
    expect(patchedBody.expiryDate).toBeNull();
    expect(patchedBody.isExpired).toBe(false);
  });

  it("a deleted document is unreachable from list/fetch immediately", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const id = await createDocumentId(cookie, vehicleId);

    const del = await deleteDocumentReq(cookie, id);
    expect(del.status).toBe(204);

    const fetchAfter = await getDocument(cookie, id);
    expect(fetchAfter.status).toBe(404);

    const listAfter = (await (await listDocuments(cookie, vehicleId)).json()) as {
      documents: { id: string }[];
    };
    expect(listAfter.documents.some((d) => d.id === id)).toBe(false);
  });

  it("refuses to update or delete a different tenant's document and leaves it intact", async () => {
    const owner = await createSession();
    const other = await createSession();
    const vehicleId = await createVehicleId(owner.cookie);
    const id = await createDocumentId(owner.cookie, vehicleId, { title: "Protected" });

    const crossPatch = await patchDocument(other.cookie, id, { title: "Hijacked" });
    expect(crossPatch.status).toBe(404);

    const crossDelete = await deleteDocumentReq(other.cookie, id);
    expect(crossDelete.status).toBe(404);

    const ownFetch = await getDocument(owner.cookie, id);
    expect(ownFetch.status).toBe(200);
    expect(((await ownFetch.json()) as { title: string }).title).toBe("Protected");
  });
});

describe("document attachments (User Story 4)", () => {
  it("uploading a valid JPEG (no EXIF) succeeds and appears on the document", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const documentId = await createDocumentId(cookie, vehicleId);
    const jpeg = buildFixtureJpeg({ includeExif: false });

    const res = await uploadAttachment(cookie, documentId, jpeg);
    expect(res.status).toBe(201);
    const created = (await res.json()) as { id: string; contentType: string; size: number };
    expect(created.contentType).toBe("image/jpeg");

    const document = (await (await getDocument(cookie, documentId)).json()) as {
      attachments: { id: string }[];
    };
    expect(document.attachments.some((a) => a.id === created.id)).toBe(true);
  });

  it("rejects a body whose magic bytes don't match any allowed format, even with a spoofed Content-Type, and creates nothing (SC-003)", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const documentId = await createDocumentId(cookie, vehicleId);
    const notActuallyJpeg = new TextEncoder().encode("this is plain text, not an image");

    const res = await uploadAttachment(cookie, documentId, notActuallyJpeg, "image/jpeg");
    expect(res.status).toBe(400);

    const document = (await (await getDocument(cookie, documentId)).json()) as {
      attachments: unknown[];
    };
    expect(document.attachments.length).toBe(0);
  });

  it("rejects a body larger than the 10MB size cap and creates nothing (SC-004)", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const documentId = await createDocumentId(cookie, vehicleId);
    const tooLarge = new Uint8Array(10 * 1024 * 1024 + 1);
    tooLarge.set([0xff, 0xd8, 0xff], 0); // valid JPEG magic bytes — size is the only problem

    const res = await uploadAttachment(cookie, documentId, tooLarge);
    expect(res.status).toBe(400);

    const document = (await (await getDocument(cookie, documentId)).json()) as {
      attachments: unknown[];
    };
    expect(document.attachments.length).toBe(0);
  });

  it("strips the EXIF/GPS segment from an uploaded JPEG before storing it (SC-005)", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const documentId = await createDocumentId(cookie, vehicleId);
    const jpegWithExif = buildFixtureJpeg({ includeExif: true });

    const uploadRes = await uploadAttachment(cookie, documentId, jpegWithExif);
    expect(uploadRes.status).toBe(201);
    const created = (await uploadRes.json()) as { id: string };

    const downloadRes = await downloadAttachment(cookie, documentId, created.id);
    expect(downloadRes.status).toBe(200);
    const storedBytes = new Uint8Array(await downloadRes.arrayBuffer());
    const storedText = new TextDecoder("latin1").decode(storedBytes);
    expect(storedText.includes(GPS_MARKER)).toBe(false);
  });

  it("refuses to download an attachment belonging to a different tenant's document, identically to a made-up id (SC-002)", async () => {
    const owner = await createSession();
    const other = await createSession();
    const vehicleId = await createVehicleId(owner.cookie);
    const documentId = await createDocumentId(owner.cookie, vehicleId);
    const created = (await (await uploadAttachment(
      owner.cookie,
      documentId,
      buildFixtureJpeg({ includeExif: false }),
    )).json()) as { id: string };
    const madeUpAttachmentId = crypto.randomUUID();

    const crossDownload = await downloadAttachment(other.cookie, documentId, created.id);
    const madeUpDownload = await downloadAttachment(other.cookie, documentId, madeUpAttachmentId);
    expect(crossDownload.status).toBe(404);
    expect(madeUpDownload.status).toBe(404);
    expect(await crossDownload.text()).toBe(await madeUpDownload.text());
  });
});

describe("vehicle deletion cleans up document R2 attachments (retrofit)", () => {
  it("deleting a vehicle removes its document's attachment from R2, not just D1", async () => {
    const { cookie, tenantId } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const documentId = await createDocumentId(cookie, vehicleId);
    const created = (await (await uploadAttachment(
      cookie,
      documentId,
      buildFixtureJpeg({ includeExif: false }),
    )).json()) as { id: string };

    const key = attachmentKey(tenantId, "documents", documentId, created.id);
    expect(await env.ATTACHMENTS.get(key)).not.toBeNull();

    const del = await deleteVehicleReq(cookie, vehicleId);
    expect(del.status).toBe(204);

    expect(await env.ATTACHMENTS.get(key)).toBeNull();
  });
});
