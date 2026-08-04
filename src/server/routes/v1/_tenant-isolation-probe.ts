import { Hono } from "hono";
import { createProbeResource, findProbeResourceById } from "../../db/repository";
import { rateLimitBySession } from "../../auth/rate-limit";
import { tenantContext } from "../../middleware/tenant-context";
import type { AppEnv } from "../../types";

/**
 * Placeholder tenant-scoped route proving isolation end-to-end (spec.md
 * User Story 1) before any real tenant-scoped resource (vehicles,
 * milestone M2) exists. Delete this file and its mount point in
 * src/server/index.ts in the first PR that adds one.
 */
export const tenantIsolationProbe = new Hono<AppEnv>();

tenantIsolationProbe.use("*", tenantContext);

tenantIsolationProbe.post("/", rateLimitBySession, async (c) => {
  const resource = await createProbeResource(c.env.DB, c.get("tenant"));
  return c.json(resource);
});

tenantIsolationProbe.get("/:id", async (c) => {
  const resource = await findProbeResourceById(c.env.DB, c.get("tenant"), c.req.param("id"));
  if (!resource) return c.notFound();
  return c.json(resource);
});
