import { Hono } from "hono";
import {
  deleteOutstandingMagicLinkTokensForTenant,
  deleteTenantAccount,
  getAccountProfile,
  listAttachmentKeysForTenant,
  listAttachmentKeysForTenantDocuments,
  listAttachmentKeysForTenantFuelRecords,
  listVehicleCoverPhotoKeysForTenant,
  listVehiclePhotoKeysForTenant,
} from "../../db/repository";
import { deleteAttachments } from "../../attachments/storage";
import {
  clearSessionCache,
  invalidateSession,
  serializeExpiredSessionCookie,
} from "../../auth/session";
import { rateLimitBySession } from "../../auth/rate-limit";
import { tenantContext } from "../../middleware/tenant-context";
import type { AppEnv } from "../../types";

export const account = new Hono<AppEnv>();

account.use("*", tenantContext);

// Real profile data only (specs/058 research.md Decision 1) — cookie-only tenantContext, never
// tenantContextOrToken: an API token must not be able to read account profile data (Constitution
// Principle VI), same boundary account deletion below already established.
account.get("/", async (c) => {
  const profile = await getAccountProfile(c.env.DB, c.get("tenant"), c.get("sessionTokenHash"));
  return c.json(profile);
});

// This app's first production sign-out route (specs/058 research.md Decision 2) — mirrors the
// dev-only /_dev/session/invalidate route's exact logic, without its notFoundOutsideDev guard.
account.post("/sign-out", rateLimitBySession, async (c) => {
  const invalidated = await invalidateSession(
    c.env.DB,
    c.env.SESSION_CACHE,
    c.req.header("Cookie") ?? null,
  );
  if (!invalidated) {
    return c.json({ error: "unauthorized" }, 401);
  }
  c.header("Set-Cookie", serializeExpiredSessionCookie());
  return c.json({ signedOut: true });
});

const REQUIRED_CONFIRMATION = "DELETE MY ACCOUNT";

type DeleteBody = {
  confirm?: unknown;
};

account.delete("/", rateLimitBySession, async (c) => {
  const body = await c.req.json().catch(() => ({}) as DeleteBody);
  if (body.confirm !== REQUIRED_CONFIRMATION) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const tenant = c.get("tenant");

  // R2 objects never cascade from a D1 delete (constitution Principle VIII) — clean them up
  // before removing the D1 rows that reference them, same ordering the single-vehicle deletion
  // route already established. If this fails, the D1 delete below never runs and the account is
  // left entirely intact (FR-008).
  const serviceAttachmentKeys = await listAttachmentKeysForTenant(c.env.DB, tenant);
  const fuelAttachmentKeys = await listAttachmentKeysForTenantFuelRecords(c.env.DB, tenant);
  const documentAttachmentKeys = await listAttachmentKeysForTenantDocuments(c.env.DB, tenant);
  const photoKeys = await listVehiclePhotoKeysForTenant(c.env.DB, tenant);
  const coverPhotoKeys = await listVehicleCoverPhotoKeysForTenant(c.env.DB, tenant);
  await deleteAttachments(c.env.ATTACHMENTS, [
    ...serviceAttachmentKeys,
    ...fuelAttachmentKeys,
    ...documentAttachmentKeys,
    ...photoKeys,
    ...coverPhotoKeys,
  ]);

  // magic_link_tokens has no foreign key to tenants/users at all (research.md) — delete it
  // explicitly before the cascade, so an outstanding sign-in link can't outlive the erasure.
  await deleteOutstandingMagicLinkTokensForTenant(c.env.DB, tenant);

  await deleteTenantAccount(c.env.DB, tenant.tenantId);

  // The sessions row is already cascade-deleted at this point. Clearing the cookie alone isn't
  // enough: resolveSession is cache-aside and checks KV before D1, so the KV entry must be
  // cleared explicitly too, or a replayed session token would still resolve for up to
  // CACHE_TTL_SECONDS longer (research.md).
  await clearSessionCache(c.env.SESSION_CACHE, c.get("sessionTokenHash"));
  c.header("Set-Cookie", serializeExpiredSessionCookie());
  return c.body(null, 204);
});
