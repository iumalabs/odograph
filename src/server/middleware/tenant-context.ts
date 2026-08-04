import { createMiddleware } from "hono/factory";
import { resolveSession } from "../auth/session";
import type { AppEnv } from "../types";

/**
 * Resolves the session cookie to {tenantId, userId} and attaches it to the
 * request context as `tenant`. Rejects with 401 before the handler runs on
 * any failure — no cookie, an unparseable one, or a token that isn't
 * currently valid (constitution Principle I, FR-001, FR-004).
 */
export const tenantContext = createMiddleware<AppEnv>(async (c, next) => {
  const resolved = await resolveSession(
    c.env.DB,
    c.env.SESSION_CACHE,
    c.req.header("Cookie") ?? null,
  );

  if (!resolved) {
    return c.json({ error: "unauthorized" }, 401);
  }

  c.set("tenant", { tenantId: resolved.tenantId, userId: resolved.userId });
  c.set("sessionTokenHash", resolved.tokenHash);
  await next();
});
