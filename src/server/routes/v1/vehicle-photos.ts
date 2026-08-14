import { Hono } from "hono";
import {
  attachVehiclePhotoImage,
  deleteVehiclePhoto,
  findVehiclePhotoById,
  updateVehiclePhoto,
} from "../../db/repository";
import type { VehiclePhoto, VehiclePhotoInput } from "../../db/repository";
import {
  attachmentKey,
  deleteAttachments,
  getAttachment,
  putAttachment,
} from "../../attachments/storage";
import { contentTypeFor, detectFileType, MAX_ATTACHMENT_BYTES } from "../../attachments/validate";
import { stripJpegExif } from "../../attachments/strip-exif";
import { rateLimitBySession } from "../../auth/rate-limit";
import { tenantContextOrToken } from "../../middleware/tenant-context";
import { idempotent } from "../../middleware/idempotency";
import type { AppEnv } from "../../types";

export const vehiclePhotos = new Hono<AppEnv>();

vehiclePhotos.use("*", tenantContextOrToken);

const VEHICLE_PHOTO_CATEGORIES = new Set(["general", "repair", "damage", "parts"]);

/** hasImage instead of the raw r2Key (an internal storage detail, never handed to a client —
 * same posture as every other attachment-backed entity in this codebase); contentType/size stay
 * visible, same as service_record_attachments' own response shape. The bytes themselves are only
 * ever reachable through GET /:id/image below. */
export function publicVehiclePhoto(photo: VehiclePhoto) {
  const { r2Key, ...rest } = photo;
  return { ...rest, hasImage: r2Key !== null };
}

vehiclePhotos.get("/:id", async (c) => {
  const photo = await findVehiclePhotoById(c.env.DB, c.get("tenant"), c.req.param("id"));
  if (!photo) return c.notFound();
  return c.json(publicVehiclePhoto(photo));
});

type PatchBody = {
  category?: unknown;
  caption?: unknown;
  photoDate?: unknown;
  odometerReading?: unknown;
  serviceRecordId?: unknown;
};

function validatePatch(body: PatchBody): Partial<VehiclePhotoInput> | null {
  const patch: Partial<VehiclePhotoInput> = {};

  if ("category" in body) {
    if (typeof body.category !== "string" || !VEHICLE_PHOTO_CATEGORIES.has(body.category)) {
      return null;
    }
    patch.category = body.category as VehiclePhotoInput["category"];
  }
  if ("caption" in body) {
    if (body.caption !== null && typeof body.caption !== "string") return null;
    patch.caption = typeof body.caption === "string" ? body.caption : null;
  }
  if ("photoDate" in body) {
    if (body.photoDate !== null && typeof body.photoDate !== "string") return null;
    patch.photoDate = typeof body.photoDate === "string" ? body.photoDate : null;
  }
  if ("odometerReading" in body) {
    if (body.odometerReading !== null && typeof body.odometerReading !== "number") return null;
    patch.odometerReading = typeof body.odometerReading === "number" ? body.odometerReading : null;
  }
  if ("serviceRecordId" in body) {
    if (body.serviceRecordId !== null && typeof body.serviceRecordId !== "string") return null;
    patch.serviceRecordId = typeof body.serviceRecordId === "string" ? body.serviceRecordId : null;
  }

  return patch;
}

vehiclePhotos.patch("/:id", rateLimitBySession, idempotent, async (c) => {
  const body = await c.req.json().catch(() => ({}) as PatchBody);
  const patch = validatePatch(body);
  if (!patch) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const photo = await updateVehiclePhoto(c.env.DB, c.get("tenant"), c.req.param("id"), patch);
  if (!photo) return c.notFound();
  return c.json(publicVehiclePhoto(photo));
});

vehiclePhotos.delete("/:id", rateLimitBySession, idempotent, async (c) => {
  const tenant = c.get("tenant");
  const id = c.req.param("id");

  const existing = await findVehiclePhotoById(c.env.DB, tenant, id);
  if (!existing) return c.notFound();

  const deleted = await deleteVehiclePhoto(c.env.DB, tenant, id);
  if (!deleted) return c.notFound();

  // R2 cleanup happens before the response, not fire-and-forget — same ordering every other
  // attachment-backed delete route in this codebase uses. A still-empty tile (no image attached
  // yet) has nothing to clean up.
  if (existing.r2Key) {
    await deleteAttachments(c.env.ATTACHMENTS, [existing.r2Key]);
  }

  return c.body(null, 204);
});

vehiclePhotos.post("/:id/image", rateLimitBySession, async (c) => {
  const tenant = c.get("tenant");
  const id = c.req.param("id");

  const existing = await findVehiclePhotoById(c.env.DB, tenant, id);
  if (!existing) return c.notFound();

  // Fast-fail on a declared oversized body before reading it into memory (same guard every
  // other attachment upload route in this codebase uses).
  const contentLength = Number(c.req.header("content-length") ?? "0");
  if (contentLength > MAX_ATTACHMENT_BYTES) {
    return c.json({ error: "file_too_large" }, 400);
  }

  const buffer = await c.req.arrayBuffer();
  if (buffer.byteLength > MAX_ATTACHMENT_BYTES) {
    return c.json({ error: "file_too_large" }, 400);
  }

  let bytes: Uint8Array = new Uint8Array(buffer);
  // The declared Content-Type header is never trusted for the accept/reject decision — only what
  // the bytes actually are (constitution Principle V).
  const detectedType = detectFileType(bytes);
  if (!detectedType) {
    return c.json({ error: "unsupported_file_type" }, 400);
  }

  if (detectedType === "jpeg") {
    bytes = stripJpegExif(bytes);
  }

  const imageId = crypto.randomUUID();
  const r2Key = attachmentKey(tenant.tenantId, "vehicle-photos", id, imageId);
  await putAttachment(c.env.ATTACHMENTS, r2Key, bytes, contentTypeFor(detectedType));

  // Replacing an already-attached image (re-upload onto the same tile) — delete the old object
  // only after the new one is safely written, so a failed upload never leaves the tile pointing
  // at nothing.
  const previousR2Key = existing.r2Key;

  const photo = await attachVehiclePhotoImage(c.env.DB, tenant, id, {
    r2Key,
    contentType: contentTypeFor(detectedType),
    size: bytes.length,
  });
  if (!photo) return c.notFound();

  if (previousR2Key) {
    await deleteAttachments(c.env.ATTACHMENTS, [previousR2Key]);
  }

  return c.json(publicVehiclePhoto(photo), 201);
});

vehiclePhotos.get("/:id/image", async (c) => {
  const photo = await findVehiclePhotoById(c.env.DB, c.get("tenant"), c.req.param("id"));
  if (!photo || !photo.r2Key || !photo.contentType) return c.notFound();

  // Served directly by this Worker route, never a redirect to a public storage URL — same
  // posture as every other attachment route in this codebase.
  const object = await getAttachment(c.env.ATTACHMENTS, photo.r2Key);
  if (!object) return c.notFound();

  return c.body(object.body, 200, { "Content-Type": photo.contentType });
});
