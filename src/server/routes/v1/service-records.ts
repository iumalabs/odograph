import { Hono } from "hono";
import {
  createAttachment,
  deleteServiceRecord,
  dismissServiceRecordDuplicate,
  findAttachmentById,
  findServiceRecordById,
  listAttachmentsForServiceRecord,
  updateServiceRecord,
} from "../../db/repository";
import type { ServiceRecordInput } from "../../db/repository";
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

export const serviceRecords = new Hono<AppEnv>();

serviceRecords.use("*", tenantContextOrToken);

serviceRecords.get("/:id", async (c) => {
  const tenant = c.get("tenant");
  const id = c.req.param("id");

  const record = await findServiceRecordById(c.env.DB, tenant, id);
  if (!record) return c.notFound();

  const rawAttachments = await listAttachmentsForServiceRecord(c.env.DB, tenant, id);
  // r2Key is an internal detail (contracts/api.md) — never returned to the client.
  const attachments = rawAttachments.map(({ id, contentType, size, createdAt }) => ({
    id,
    contentType,
    size,
    createdAt,
  }));

  return c.json({ ...record, attachments });
});

serviceRecords.post("/:id/dismiss-duplicate", rateLimitBySession, idempotent, async (c) => {
  const record = await dismissServiceRecordDuplicate(c.env.DB, c.get("tenant"), c.req.param("id"));
  if (!record) return c.notFound();
  return c.json(record);
});

type PatchBody = {
  serviceDate?: unknown;
  description?: unknown;
  odometerReading?: unknown;
  cost?: unknown;
  notes?: unknown;
};

function validatePatch(body: PatchBody): Partial<ServiceRecordInput> | null {
  const patch: Partial<ServiceRecordInput> = {};

  if ("serviceDate" in body) {
    if (typeof body.serviceDate !== "string" || body.serviceDate.length === 0) return null;
    patch.serviceDate = body.serviceDate;
  }
  if ("description" in body) {
    if (typeof body.description !== "string" || body.description.length === 0) return null;
    patch.description = body.description;
  }
  if ("odometerReading" in body) {
    if (body.odometerReading !== null && typeof body.odometerReading !== "number") return null;
    patch.odometerReading = typeof body.odometerReading === "number" ? body.odometerReading : null;
  }
  if ("cost" in body) {
    if (body.cost !== null && typeof body.cost !== "number") return null;
    patch.cost = typeof body.cost === "number" ? body.cost : null;
  }
  if ("notes" in body) {
    if (body.notes !== null && typeof body.notes !== "string") return null;
    patch.notes = typeof body.notes === "string" ? body.notes : null;
  }

  return patch;
}

serviceRecords.patch("/:id", rateLimitBySession, idempotent, async (c) => {
  const body = await c.req.json().catch(() => ({}) as PatchBody);
  const patch = validatePatch(body);
  if (!patch) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const record = await updateServiceRecord(c.env.DB, c.get("tenant"), c.req.param("id"), patch);
  if (!record) return c.notFound();
  return c.json(record);
});

serviceRecords.delete("/:id", rateLimitBySession, idempotent, async (c) => {
  const tenant = c.get("tenant");
  const id = c.req.param("id");

  const r2Keys = await deleteServiceRecord(c.env.DB, tenant, id);
  if (r2Keys === null) return c.notFound();

  // R2 cleanup happens before the response, not fire-and-forget (data-model.md's erasure
  // requirement).
  await deleteAttachments(c.env.ATTACHMENTS, r2Keys);

  return c.body(null, 204);
});

serviceRecords.post("/:id/attachments", rateLimitBySession, async (c) => {
  const tenant = c.get("tenant");
  const serviceRecordId = c.req.param("id");

  const record = await findServiceRecordById(c.env.DB, tenant, serviceRecordId);
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
  const r2Key = attachmentKey(tenant.tenantId, serviceRecordId, id);
  await putAttachment(c.env.ATTACHMENTS, r2Key, bytes, contentTypeFor(detectedType));

  const attachment = await createAttachment(c.env.DB, tenant, {
    id,
    serviceRecordId,
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

serviceRecords.get("/:id/attachments/:attachmentId", async (c) => {
  const tenant = c.get("tenant");
  const serviceRecordId = c.req.param("id");
  const attachmentId = c.req.param("attachmentId");

  const record = await findServiceRecordById(c.env.DB, tenant, serviceRecordId);
  if (!record) return c.notFound();

  const attachment = await findAttachmentById(c.env.DB, tenant, attachmentId);
  if (!attachment || attachment.serviceRecordId !== serviceRecordId) return c.notFound();

  // Served directly by this Worker route, never a redirect to a public storage URL (FR-013).
  const object = await getAttachment(c.env.ATTACHMENTS, attachment.r2Key);
  if (!object) return c.notFound();

  return c.body(object.body, 200, { "Content-Type": attachment.contentType });
});
