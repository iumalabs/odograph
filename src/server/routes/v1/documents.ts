import { Hono } from "hono";
import {
  createDocumentAttachment,
  deleteDocument,
  findDocumentAttachmentById,
  findDocumentById,
  listDocumentAttachmentsForDocument,
  updateDocument,
} from "../../db/repository";
import type { DocumentInput } from "../../db/repository";
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

export const documents = new Hono<AppEnv>();

documents.use("*", tenantContextOrToken);

const DOCUMENT_CATEGORIES = new Set([
  "registration",
  "insurance",
  "warranty",
  "inspection",
  "other",
]);

documents.get("/:id", async (c) => {
  const tenant = c.get("tenant");
  const id = c.req.param("id");

  const document = await findDocumentById(c.env.DB, tenant, id);
  if (!document) return c.notFound();

  const rawAttachments = await listDocumentAttachmentsForDocument(c.env.DB, tenant, id);
  // r2Key is an internal detail (contracts/api.md) — never returned to the client.
  const attachments = rawAttachments.map(({ id, contentType, size, createdAt }) => ({
    id,
    contentType,
    size,
    createdAt,
  }));

  return c.json({ ...document, attachments });
});

type PatchBody = {
  title?: unknown;
  category?: unknown;
  expiryDate?: unknown;
  notes?: unknown;
};

function validatePatch(body: PatchBody): Partial<DocumentInput> | null {
  const patch: Partial<DocumentInput> = {};

  if ("title" in body) {
    if (typeof body.title !== "string" || body.title.length === 0) return null;
    patch.title = body.title;
  }
  if ("category" in body) {
    if (typeof body.category !== "string" || !DOCUMENT_CATEGORIES.has(body.category)) return null;
    patch.category = body.category as DocumentInput["category"];
  }
  if ("expiryDate" in body) {
    if (body.expiryDate !== null && typeof body.expiryDate !== "string") return null;
    patch.expiryDate = typeof body.expiryDate === "string" ? body.expiryDate : null;
  }
  if ("notes" in body) {
    if (body.notes !== null && typeof body.notes !== "string") return null;
    patch.notes = typeof body.notes === "string" ? body.notes : null;
  }

  return patch;
}

documents.patch("/:id", rateLimitBySession, idempotent, async (c) => {
  const body = await c.req.json().catch(() => ({}) as PatchBody);
  const patch = validatePatch(body);
  if (!patch) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const document = await updateDocument(c.env.DB, c.get("tenant"), c.req.param("id"), patch);
  if (!document) return c.notFound();
  return c.json(document);
});

documents.delete("/:id", rateLimitBySession, idempotent, async (c) => {
  const tenant = c.get("tenant");
  const id = c.req.param("id");

  const r2Keys = await deleteDocument(c.env.DB, tenant, id);
  if (r2Keys === null) return c.notFound();

  // R2 cleanup happens before the response, not fire-and-forget (data-model.md's erasure
  // requirement).
  await deleteAttachments(c.env.ATTACHMENTS, r2Keys);

  return c.body(null, 204);
});

documents.post("/:id/attachments", rateLimitBySession, async (c) => {
  const tenant = c.get("tenant");
  const documentId = c.req.param("id");

  const document = await findDocumentById(c.env.DB, tenant, documentId);
  if (!document) return c.notFound();

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
  // what the bytes actually are (constitution Principle V, FR-012).
  const detectedType = detectFileType(bytes);
  if (!detectedType) {
    return c.json({ error: "unsupported_file_type" }, 400);
  }

  if (detectedType === "jpeg") {
    bytes = stripJpegExif(bytes);
  }

  const id = crypto.randomUUID();
  const r2Key = attachmentKey(tenant.tenantId, "documents", documentId, id);
  await putAttachment(c.env.ATTACHMENTS, r2Key, bytes, contentTypeFor(detectedType));

  const attachment = await createDocumentAttachment(c.env.DB, tenant, {
    id,
    documentId,
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

documents.get("/:id/attachments/:attachmentId", async (c) => {
  const tenant = c.get("tenant");
  const documentId = c.req.param("id");
  const attachmentId = c.req.param("attachmentId");

  const document = await findDocumentById(c.env.DB, tenant, documentId);
  if (!document) return c.notFound();

  const attachment = await findDocumentAttachmentById(c.env.DB, tenant, attachmentId);
  if (!attachment || attachment.documentId !== documentId) return c.notFound();

  // Served directly by this Worker route, never a redirect to a public storage URL (FR-015).
  const object = await getAttachment(c.env.ATTACHMENTS, attachment.r2Key);
  if (!object) return c.notFound();

  return c.body(object.body, 200, { "Content-Type": attachment.contentType });
});
