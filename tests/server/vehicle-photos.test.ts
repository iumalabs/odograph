import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { buildFixtureJpeg } from "./fixtures/jpeg";
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

async function createServiceRecordId(cookie: string, vehicleId: string): Promise<string> {
  const res = await SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/service-records`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ serviceDate: "2026-01-01", description: "Oil change" }),
  });
  const created = (await res.json()) as { id: string };
  return created.id;
}

type PhotoBody = {
  category?: unknown;
  caption?: unknown;
  photoDate?: unknown;
  odometerReading?: unknown;
  serviceRecordId?: unknown;
};

function createPhoto(cookie: string, vehicleId: string, body: PhotoBody): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/photos`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function listPhotos(cookie: string, vehicleId: string): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/photos`, {
    headers: { Cookie: cookie },
  });
}

function getPhoto(cookie: string, id: string): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicle-photos/${id}`, {
    headers: { Cookie: cookie },
  });
}

function patchPhoto(cookie: string, id: string, body: PhotoBody): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicle-photos/${id}`, {
    method: "PATCH",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deletePhotoReq(cookie: string, id: string): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicle-photos/${id}`, {
    method: "DELETE",
    headers: { Cookie: cookie },
  });
}

function uploadImage(
  cookie: string,
  photoId: string,
  bytes: Uint8Array,
  contentType = "application/octet-stream",
): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicle-photos/${photoId}/image`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": contentType },
    body: bytes,
  });
}

function downloadImage(cookie: string, photoId: string): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicle-photos/${photoId}/image`, {
    headers: { Cookie: cookie },
  });
}

describe("vehicle photo gallery (design mockup's new photos screen)", () => {
  it("creates an empty (imageless) photo tile with a category, defaults for everything else", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);

    const res = await createPhoto(cookie, vehicleId, { category: "general" });
    expect(res.status).toBe(201);
    const photo = (await res.json()) as Record<string, unknown>;
    expect(photo.category).toBe("general");
    expect(photo.hasImage).toBe(false);
    expect(photo.caption).toBeNull();
    expect(photo.r2Key).toBeUndefined(); // internal detail, never returned to the client
  });

  it("rejects an invalid or missing category", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);

    const missing = await createPhoto(cookie, vehicleId, {});
    expect(missing.status).toBe(400);

    const invalid = await createPhoto(cookie, vehicleId, { category: "not-a-category" });
    expect(invalid.status).toBe(400);
  });

  it("accepts caption/date/odometer and a service record it actually links to", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const serviceRecordId = await createServiceRecordId(cookie, vehicleId);

    const res = await createPhoto(cookie, vehicleId, {
      category: "repair",
      caption: "Front bumper crack",
      photoDate: "2026-03-01",
      odometerReading: 42000,
      serviceRecordId,
    });
    expect(res.status).toBe(201);
    const photo = (await res.json()) as Record<string, unknown>;
    expect(photo.caption).toBe("Front bumper crack");
    expect(photo.photoDate).toBe("2026-03-01");
    expect(photo.odometerReading).toBe(42000);
    expect(photo.serviceRecordId).toBe(serviceRecordId);
  });

  it("rejects a serviceRecordId that doesn't belong to this vehicle", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const otherVehicleId = await createVehicleId(cookie);
    const foreignServiceRecordId = await createServiceRecordId(cookie, otherVehicleId);

    const res = await createPhoto(cookie, vehicleId, {
      category: "general",
      serviceRecordId: foreignServiceRecordId,
    });
    expect(res.status).toBe(400);
  });

  it("lists only this vehicle's photos", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const otherVehicleId = await createVehicleId(cookie);
    await createPhoto(cookie, vehicleId, { category: "general" });
    await createPhoto(cookie, vehicleId, { category: "damage" });
    await createPhoto(cookie, otherVehicleId, { category: "parts" });

    const res = await listPhotos(cookie, vehicleId);
    const { photos } = (await res.json()) as { photos: Array<{ category: string }> };
    expect(photos.length).toBe(2);
    expect(photos.map((p) => p.category).sort()).toEqual(["damage", "general"]);
  });

  it("uploads an image onto an existing tile; GET .../image serves the exact bytes back", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const created = (await (await createPhoto(cookie, vehicleId, { category: "general" }))
      .json()) as { id: string };

    const bytes = buildFixtureJpeg({ includeExif: false });
    const upload = await uploadImage(cookie, created.id, bytes, "image/jpeg");
    expect(upload.status).toBe(201);
    const uploaded = (await upload.json()) as { hasImage: boolean; contentType: string };
    expect(uploaded.hasImage).toBe(true);
    expect(uploaded.contentType).toBe("image/jpeg");

    const download = await downloadImage(cookie, created.id);
    expect(download.status).toBe(200);
    expect(download.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(bytes);
  });

  it("rejects an upload whose bytes aren't a recognizable image type", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const created = (await (await createPhoto(cookie, vehicleId, { category: "general" }))
      .json()) as { id: string };

    const res = await uploadImage(cookie, created.id, new Uint8Array([1, 2, 3, 4]));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "unsupported_file_type" });
  });

  it("replacing an image deletes the previous R2 object, not just overwrites the D1 row", async () => {
    const { cookie, tenantId } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const created = (await (await createPhoto(cookie, vehicleId, { category: "general" }))
      .json()) as { id: string };

    const first = (await (await uploadImage(
      cookie,
      created.id,
      buildFixtureJpeg({ includeExif: false }),
      "image/jpeg",
    )).json()) as { id: string };
    // The upload response doesn't expose r2Key, but the key convention is deterministic
    // (attachmentKey), so the first image's key can be derived the same way the route did.
    const firstImageId = await (async () => {
      // Only way to recover the image id the server generated: re-derive by checking which key
      // under this photo's prefix currently exists before the second upload.
      const listed = await env.ATTACHMENTS.list({
        prefix: `tenants/${tenantId}/vehicle-photos/${created.id}/`,
      });
      expect(listed.objects.length).toBe(1);
      return listed.objects[0]!.key.split("/").pop()!;
    })();
    const firstKey = attachmentKey(tenantId, "vehicle-photos", created.id, firstImageId);
    expect(await env.ATTACHMENTS.get(firstKey)).not.toBeNull();
    expect(first.id).toBe(created.id);

    await uploadImage(cookie, created.id, buildFixtureJpeg({ includeExif: true }), "image/jpeg");

    expect(await env.ATTACHMENTS.get(firstKey)).toBeNull();
    const listedAfter = await env.ATTACHMENTS.list({
      prefix: `tenants/${tenantId}/vehicle-photos/${created.id}/`,
    });
    expect(listedAfter.objects.length).toBe(1);
  });

  it("patches category/caption/date/odometer without touching an already-attached image", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const created = (await (await createPhoto(cookie, vehicleId, { category: "general" }))
      .json()) as { id: string };
    await uploadImage(cookie, created.id, buildFixtureJpeg({ includeExif: false }), "image/jpeg");

    const res = await patchPhoto(cookie, created.id, { category: "damage", caption: "Dent" });
    expect(res.status).toBe(200);
    const patched = (await res.json()) as { category: string; caption: string; hasImage: boolean };
    expect(patched.category).toBe("damage");
    expect(patched.caption).toBe("Dent");
    expect(patched.hasImage).toBe(true);
  });

  it("rejects an invalid category on patch", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const created = (await (await createPhoto(cookie, vehicleId, { category: "general" }))
      .json()) as { id: string };

    const res = await patchPhoto(cookie, created.id, { category: "nope" });
    expect(res.status).toBe(400);
  });

  it("deleting a photo removes both the D1 row and its R2 image", async () => {
    const { cookie, tenantId } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const created = (await (await createPhoto(cookie, vehicleId, { category: "general" }))
      .json()) as { id: string };
    await uploadImage(cookie, created.id, buildFixtureJpeg({ includeExif: false }), "image/jpeg");

    const listed = await env.ATTACHMENTS.list({
      prefix: `tenants/${tenantId}/vehicle-photos/${created.id}/`,
    });
    const key = listed.objects[0]!.key;
    expect(await env.ATTACHMENTS.get(key)).not.toBeNull();

    const del = await deletePhotoReq(cookie, created.id);
    expect(del.status).toBe(204);
    expect(await env.ATTACHMENTS.get(key)).toBeNull();
    expect((await getPhoto(cookie, created.id)).status).toBe(404);
  });

  it("deleting a still-empty tile (no image ever attached) is a clean 204", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const created = (await (await createPhoto(cookie, vehicleId, { category: "general" }))
      .json()) as { id: string };

    const del = await deletePhotoReq(cookie, created.id);
    expect(del.status).toBe(204);
  });

  it("returns 404 for a photo belonging to a different tenant, on every route", async () => {
    const owner = await createSession();
    const other = await createSession();
    const vehicleId = await createVehicleId(owner.cookie);
    const created = (await (await createPhoto(owner.cookie, vehicleId, { category: "general" }))
      .json()) as { id: string };

    expect((await getPhoto(other.cookie, created.id)).status).toBe(404);
    expect((await patchPhoto(other.cookie, created.id, { caption: "x" })).status).toBe(404);
    expect((await deletePhotoReq(other.cookie, created.id)).status).toBe(404);
    expect(
      (await uploadImage(other.cookie, created.id, buildFixtureJpeg({ includeExif: false })))
        .status,
    ).toBe(404);
    expect((await downloadImage(other.cookie, created.id)).status).toBe(404);
  });

  it("returns 404 creating/listing photos for an unknown or cross-tenant vehicle", async () => {
    const owner = await createSession();
    const other = await createSession();
    const vehicleId = await createVehicleId(owner.cookie);
    const unknown = "00000000-0000-0000-0000-000000000000";

    expect((await createPhoto(other.cookie, vehicleId, { category: "general" })).status).toBe(404);
    expect((await listPhotos(other.cookie, vehicleId)).status).toBe(404);
    expect((await createPhoto(owner.cookie, unknown, { category: "general" })).status).toBe(404);
    expect((await listPhotos(owner.cookie, unknown)).status).toBe(404);
  });
});

describe("vehicle deletion cleans up the photo gallery's R2 images (retrofit)", () => {
  it("deleting a vehicle removes every gallery photo's R2 image, not just the D1 rows", async () => {
    const { cookie, tenantId } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const created = (await (await createPhoto(cookie, vehicleId, { category: "general" }))
      .json()) as { id: string };
    await uploadImage(cookie, created.id, buildFixtureJpeg({ includeExif: false }), "image/jpeg");

    const listed = await env.ATTACHMENTS.list({
      prefix: `tenants/${tenantId}/vehicle-photos/${created.id}/`,
    });
    const key = listed.objects[0]!.key;
    expect(await env.ATTACHMENTS.get(key)).not.toBeNull();

    const del = await deleteVehicleReq(cookie, vehicleId);
    expect(del.status).toBe(204);
    expect(await env.ATTACHMENTS.get(key)).toBeNull();
  });
});

// The single vehicles.photo_r2_key cover photo (specs/053's follow-up PR) has no create/upload
// API yet (data-import-only until an editing UI exists), so these tests set it directly in D1,
// same technique other tests already use for server-only state.
function uploadVehicleCoverPhotoReq(
  cookie: string,
  vehicleId: string,
  bytes: Uint8Array,
  contentType = "application/octet-stream",
): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/photo`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": contentType },
    body: bytes,
  });
}

function deleteVehicleCoverPhotoReq(cookie: string, vehicleId: string): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/photo`, {
    method: "DELETE",
    headers: { Cookie: cookie },
  });
}

describe("vehicle cover photo (vehicles.photo_r2_key)", () => {
  async function setCoverPhoto(
    tenantId: string,
    vehicleId: string,
    r2Key: string,
    contentType: string,
  ): Promise<void> {
    await env.DB.prepare(
      "UPDATE vehicles SET photo_r2_key = ?, photo_content_type = ? WHERE id = ? AND tenant_id = ?",
    ).bind(r2Key, contentType, vehicleId, tenantId).run();
  }

  it("GET .../photo 404s when no cover photo is set; hasPhoto is false", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);

    const res = await SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}`, {
      headers: { Cookie: cookie },
    });
    expect(((await res.json()) as { hasPhoto: boolean }).hasPhoto).toBe(false);

    const photoRes = await SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/photo`, {
      headers: { Cookie: cookie },
    });
    expect(photoRes.status).toBe(404);
  });

  it("serves the exact bytes once a cover photo is set, and flips hasPhoto to true", async () => {
    const { cookie, tenantId } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const bytes = buildFixtureJpeg({ includeExif: false });
    const key = attachmentKey(tenantId, "service-records", "cover-photo-fixture", vehicleId);
    await env.ATTACHMENTS.put(key, bytes, { httpMetadata: { contentType: "image/jpeg" } });
    await setCoverPhoto(tenantId, vehicleId, key, "image/jpeg");

    const res = await SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}`, {
      headers: { Cookie: cookie },
    });
    expect(((await res.json()) as { hasPhoto: boolean }).hasPhoto).toBe(true);

    const photoRes = await SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/photo`, {
      headers: { Cookie: cookie },
    });
    expect(photoRes.status).toBe(200);
    expect(photoRes.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await photoRes.arrayBuffer())).toEqual(bytes);
  });

  it("deleting the vehicle removes its cover photo from R2 too", async () => {
    const { cookie, tenantId } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const key = attachmentKey(tenantId, "service-records", "cover-photo-fixture-2", vehicleId);
    await env.ATTACHMENTS.put(key, buildFixtureJpeg({ includeExif: false }), {
      httpMetadata: { contentType: "image/jpeg" },
    });
    await setCoverPhoto(tenantId, vehicleId, key, "image/jpeg");
    expect(await env.ATTACHMENTS.get(key)).not.toBeNull();

    const del = await deleteVehicleReq(cookie, vehicleId);
    expect(del.status).toBe(204);
    expect(await env.ATTACHMENTS.get(key)).toBeNull();
  });
});

describe("vehicle cover photo upload/delete routes", () => {
  it("uploads a cover photo; GET .../photo serves the exact bytes back, hasPhoto flips true", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const bytes = buildFixtureJpeg({ includeExif: false });

    const upload = await uploadVehicleCoverPhotoReq(cookie, vehicleId, bytes, "image/jpeg");
    expect(upload.status).toBe(200);
    const uploaded = (await upload.json()) as { hasPhoto: boolean };
    expect(uploaded.hasPhoto).toBe(true);

    const photoRes = await SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/photo`, {
      headers: { Cookie: cookie },
    });
    expect(photoRes.status).toBe(200);
    expect(photoRes.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await photoRes.arrayBuffer())).toEqual(bytes);
  });

  it("strips EXIF from an uploaded jpeg cover photo, same as every other attachment upload", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const bytes = buildFixtureJpeg({ includeExif: true });

    await uploadVehicleCoverPhotoReq(cookie, vehicleId, bytes, "image/jpeg");

    const photoRes = await SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/photo`, {
      headers: { Cookie: cookie },
    });
    const served = new Uint8Array(await photoRes.arrayBuffer());
    expect(served).not.toEqual(bytes);
    expect(served.length).toBeLessThan(bytes.length);
  });

  it("rejects an upload whose bytes aren't a recognizable image type", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);

    const res = await uploadVehicleCoverPhotoReq(cookie, vehicleId, new Uint8Array([1, 2, 3, 4]));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "unsupported_file_type" });

    const check = await SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}`, {
      headers: { Cookie: cookie },
    });
    expect(((await check.json()) as { hasPhoto: boolean }).hasPhoto).toBe(false);
  });

  it("re-uploading replaces the cover photo in place at the same R2 key", async () => {
    const { cookie, tenantId } = await createSession();
    const vehicleId = await createVehicleId(cookie);

    await uploadVehicleCoverPhotoReq(
      cookie,
      vehicleId,
      buildFixtureJpeg({ includeExif: false }),
      "image/jpeg",
    );
    const secondBytes = buildFixtureJpeg({ includeExif: true });
    await uploadVehicleCoverPhotoReq(cookie, vehicleId, secondBytes, "image/jpeg");

    const key = attachmentKey(tenantId, "vehicles", vehicleId, "photo");
    const stored = await env.ATTACHMENTS.get(key);
    expect(stored).not.toBeNull();

    // Only one object ever exists under this vehicle's cover-photo prefix — a re-upload
    // overwrites the fixed key rather than accumulating orphaned objects.
    const listed = await env.ATTACHMENTS.list({ prefix: `tenants/${tenantId}/vehicles/` });
    expect(listed.objects.length).toBe(1);

    const photoRes = await SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/photo`, {
      headers: { Cookie: cookie },
    });
    expect(new Uint8Array(await photoRes.arrayBuffer())).not.toEqual(secondBytes);
  });

  it("deletes the cover photo; GET .../photo 404s afterward, hasPhoto flips false, R2 object removed", async () => {
    const { cookie, tenantId } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    await uploadVehicleCoverPhotoReq(
      cookie,
      vehicleId,
      buildFixtureJpeg({ includeExif: false }),
      "image/jpeg",
    );

    const del = await deleteVehicleCoverPhotoReq(cookie, vehicleId);
    expect(del.status).toBe(200);
    expect(((await del.json()) as { hasPhoto: boolean }).hasPhoto).toBe(false);

    const photoRes = await SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/photo`, {
      headers: { Cookie: cookie },
    });
    expect(photoRes.status).toBe(404);

    const key = attachmentKey(tenantId, "vehicles", vehicleId, "photo");
    expect(await env.ATTACHMENTS.get(key)).toBeNull();
  });

  it("404s deleting a cover photo that was never set", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);

    const del = await deleteVehicleCoverPhotoReq(cookie, vehicleId);
    expect(del.status).toBe(404);
  });

  it("404s uploading or deleting a cover photo for a different tenant's vehicle or a made-up id", async () => {
    const owner = await createSession();
    const other = await createSession();
    const vehicleId = await createVehicleId(owner.cookie);
    const madeUpId = crypto.randomUUID();

    const crossUpload = await uploadVehicleCoverPhotoReq(
      other.cookie,
      vehicleId,
      buildFixtureJpeg({ includeExif: false }),
      "image/jpeg",
    );
    expect(crossUpload.status).toBe(404);

    const madeUpUpload = await uploadVehicleCoverPhotoReq(
      owner.cookie,
      madeUpId,
      buildFixtureJpeg({ includeExif: false }),
      "image/jpeg",
    );
    expect(madeUpUpload.status).toBe(404);

    const crossDelete = await deleteVehicleCoverPhotoReq(other.cookie, vehicleId);
    expect(crossDelete.status).toBe(404);
  });
});
