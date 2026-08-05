import { Hono } from "hono";
import {
  deleteServiceRecord,
  findServiceRecordById,
  listAttachmentsForServiceRecord,
  updateServiceRecord,
} from "../../db/repository";
import type { ServiceRecordInput } from "../../db/repository";
import { deleteAttachments } from "../../attachments/storage";
import { rateLimitBySession } from "../../auth/rate-limit";
import { tenantContext } from "../../middleware/tenant-context";
import type { AppEnv } from "../../types";

export const serviceRecords = new Hono<AppEnv>();

serviceRecords.use("*", tenantContext);

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

serviceRecords.patch("/:id", rateLimitBySession, async (c) => {
  const body = await c.req.json().catch(() => ({}) as PatchBody);
  const patch = validatePatch(body);
  if (!patch) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const record = await updateServiceRecord(c.env.DB, c.get("tenant"), c.req.param("id"), patch);
  if (!record) return c.notFound();
  return c.json(record);
});

serviceRecords.delete("/:id", rateLimitBySession, async (c) => {
  const tenant = c.get("tenant");
  const id = c.req.param("id");

  const r2Keys = await deleteServiceRecord(c.env.DB, tenant, id);
  if (r2Keys === null) return c.notFound();

  // R2 cleanup happens before the response, not fire-and-forget (data-model.md's erasure
  // requirement).
  await deleteAttachments(c.env.ATTACHMENTS, r2Keys);

  return c.body(null, 204);
});

// Routes added incrementally: POST /:id/attachments and
// GET /:id/attachments/:attachmentId (T016/T017).
