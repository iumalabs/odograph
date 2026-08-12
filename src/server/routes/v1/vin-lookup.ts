import { Hono } from "hono";
import { decodeVin } from "../../vin-lookup/decode-vin";
import { rateLimitBySession } from "../../auth/rate-limit";
import { tenantContextOrToken } from "../../middleware/tenant-context";
import type { AppEnv } from "../../types";

export const vinLookup = new Hono<AppEnv>();

vinLookup.use("*", tenantContextOrToken);

// Not tenant-data-scoped — this route touches no D1 data, it's a pure proxy to NHTSA vPIC
// (specs/030 contracts/api.md). Rate-limited as defense-in-depth against relaying abuse traffic to
// a third party through this app's identity (research.md), not because it writes to D1.
vinLookup.get("/:vin", rateLimitBySession, async (c) => {
  const result = await decodeVin(c.req.param("vin"));
  if (result.ok) {
    return c.json({ found: true, make: result.make, model: result.model, year: result.year });
  }
  return c.json({ found: false, make: null, model: null, year: null });
});
