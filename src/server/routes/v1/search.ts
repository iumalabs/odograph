import { Hono } from "hono";
import { searchTenantData } from "../../db/repository";
import { tenantContextOrToken } from "../../middleware/tenant-context";
import type { AppEnv } from "../../types";

export const search = new Hono<AppEnv>();

search.use("*", tenantContextOrToken);

const MIN_QUERY_LENGTH = 2;

// Tenant-wide, not vehicle-scoped — read-only, not rate-limited, matching every other GET route's
// posture (specs/028).
search.get("/", async (c) => {
  const query = (c.req.query("q") ?? "").trim();
  if (query.length < MIN_QUERY_LENGTH) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const results = await searchTenantData(c.env.DB, c.get("tenant"), query);
  return c.json(results);
});
