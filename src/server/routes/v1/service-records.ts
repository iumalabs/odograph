import { Hono } from "hono";
import { tenantContext } from "../../middleware/tenant-context";
import type { AppEnv } from "../../types";

export const serviceRecords = new Hono<AppEnv>();

serviceRecords.use("*", tenantContext);

// Routes added incrementally: GET /:id (T012), PATCH/DELETE /:id (T014),
// POST /:id/attachments and GET /:id/attachments/:attachmentId (T016/T017).
