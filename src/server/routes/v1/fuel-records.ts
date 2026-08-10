import { Hono } from "hono";
import {
  createFuelAttachment,
  deleteFuelRecord,
  dismissFuelRecordDuplicate,
  findFuelAttachmentById,
  findFuelRecordById,
  listAttachmentsForFuelRecord,
  updateFuelRecord,
} from "../../db/repository";
import type { FuelRecordInput } from "../../db/repository";
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

export const fuelRecords = new Hono<AppEnv>();

fuelRecords.use("*", tenantContextOrToken);

fuelRecords.get("/:id", async (c) => {
  const tenant = c.get("tenant");
  const id = c.req.param("id");

  const record = await findFuelRecordById(c.env.DB, tenant, id);
  if (!record) return c.notFound();

  const rawAttachments = await listAttachmentsForFuelRecord(c.env.DB, tenant, id);
  // r2Key is an internal detail (contracts/api.md) — never returned to the client.
  const attachments = rawAttachments.map(({ id, contentType, size, createdAt }) => ({
    id,
    contentType,
    size,
    createdAt,
  }));

  return c.json({ ...record, attachments });
});

fuelRecords.post("/:id/dismiss-duplicate", rateLimitBySession, idempotent, async (c) => {
  const record = await dismissFuelRecordDuplicate(c.env.DB, c.get("tenant"), c.req.param("id"));
  if (!record) return c.notFound();
  return c.json(record);
});

type PatchBody = {
  fuelDate?: unknown;
  odometerReading?: unknown;
  volume?: unknown;
  cost?: unknown;
  station?: unknown;
  notes?: unknown;
};

function validatePatch(body: PatchBody): Partial<FuelRecordInput> | null {
  const patch: Partial<FuelRecordInput> = {};

  if ("fuelDate" in body) {
    if (typeof body.fuelDate !== "string" || body.fuelDate.length === 0) return null;
    patch.fuelDate = body.fuelDate;
  }
  if ("odometerReading" in body) {
    if (typeof body.odometerReading !== "number") return null;
    patch.odometerReading = body.odometerReading;
  }
  if ("volume" in body) {
    if (typeof body.volume !== "number") return null;
    patch.volume = body.volume;
  }
  if ("cost" in body) {
    if (typeof body.cost !== "number") return null;
    patch.cost = body.cost;
  }
  if ("station" in body) {
    if (body.station !== null && typeof body.station !== "string") return null;
    patch.station = typeof body.station === "string" ? body.station : null;
  }
  if ("notes" in body) {
    if (body.notes !== null && typeof body.notes !== "string") return null;
    patch.notes = typeof body.notes === "string" ? body.notes : null;
  }

  return patch;
}

fuelRecords.patch("/:id", rateLimitBySession, idempotent, async (c) => {
  const body = await c.req.json().catch(() => ({}) as PatchBody);
  const patch = validatePatch(body);
  if (!patch) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const record = await updateFuelRecord(c.env.DB, c.get("tenant"), c.req.param("id"), patch);
  if (!record) return c.notFound();
  return c.json(record);
});

fuelRecords.delete("/:id", rateLimitBySession, idempotent, async (c) => {
  const tenant = c.get("tenant");
  const id = c.req.param("id");

  const r2Keys = await deleteFuelRecord(c.env.DB, tenant, id);
  if (r2Keys === null) return c.notFound();

  // R2 cleanup happens before the response, not fire-and-forget (data-model.md's erasure
  // requirement).
  await deleteAttachments(c.env.ATTACHMENTS, r2Keys);

  return c.body(null, 204);
});

fuelRecords.post("/:id/attachments", rateLimitBySession, async (c) => {
  const tenant = c.get("tenant");
  const fuelRecordId = c.req.param("id");

  const record = await findFuelRecordById(c.env.DB, tenant, fuelRecordId);
  if (!record) return c.notFound();

  // Fast-fail on a declared oversized body before reading it into memory (research.md).
  const contentLength = Number(c.req.header("content-length") ?? "0");
  if (contentLength > MAX_ATTACHMENT_BYTES) {
    return c.json({ error: "file_too_large" }, 400);
  }

  const buffer = await c.req.arrayBuffer();
  if (buffer.byteLength > MAX_ATTACHMENT_BYTES) {
    return c.json({ error: "file_too_large" }, 400);
  }

  let bytes: Uint8Array = new Uint8Array(buffer);
  // The declared Content-Type header is never trusted for the accept/reject decision — only
  // what the bytes actually are (constitution Principle V, FR-010).
  const detectedType = detectFileType(bytes);
  if (!detectedType) {
    return c.json({ error: "unsupported_file_type" }, 400);
  }

  if (detectedType === "jpeg") {
    bytes = stripJpegExif(bytes);
  }

  const id = crypto.randomUUID();
  const r2Key = attachmentKey(tenant.tenantId, "fuel-records", fuelRecordId, id);
  await putAttachment(c.env.ATTACHMENTS, r2Key, bytes, contentTypeFor(detectedType));

  const attachment = await createFuelAttachment(c.env.DB, tenant, {
    id,
    fuelRecordId,
    r2Key,
    contentType: contentTypeFor(detectedType),
    size: bytes.length,
  });

  return c.json(
    {
      id: attachment.id,
      contentType: attachment.contentType,
      size: attachment.size,
      createdAt: attachment.createdAt,
    },
    201,
  );
});

fuelRecords.get("/:id/attachments/:attachmentId", async (c) => {
  const tenant = c.get("tenant");
  const fuelRecordId = c.req.param("id");
  const attachmentId = c.req.param("attachmentId");

  const record = await findFuelRecordById(c.env.DB, tenant, fuelRecordId);
  if (!record) return c.notFound();

  const attachment = await findFuelAttachmentById(c.env.DB, tenant, attachmentId);
  if (!attachment || attachment.fuelRecordId !== fuelRecordId) return c.notFound();

  // Served directly by this Worker route, never a redirect to a public storage URL (FR-011).
  const object = await getAttachment(c.env.ATTACHMENTS, attachment.r2Key);
  if (!object) return c.notFound();

  return c.body(object.body, 200, { "Content-Type": attachment.contentType });
});
