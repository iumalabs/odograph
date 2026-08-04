import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { createTenant, createUser } from "../db/repository";
import { invalidateSession, issueSession, serializeExpiredSessionCookie } from "./session";
import { rateLimitByIp, rateLimitBySession } from "./rate-limit";
import { tenantContext } from "../middleware/tenant-context";
import type { AppEnv } from "../types";

/**
 * Runs first, before any other middleware, so a production deploy does
 * nothing at all for this route — no rate-limit counter write, no session
 * lookup — not just an early return from within the handler.
 */
const notFoundOutsideDev = createMiddleware<AppEnv>(async (c, next) => {
  if (c.env.ENVIRONMENT === "production") return c.notFound();
  await next();
});

/**
 * Dev/test-only session-issuing routes (FR-009). Stand in for real login
 * (passkey/magic-link/OIDC — separate specs) until one of those exists.
 *
 * Hono routes are wired up at module-eval time, before any request (and
 * therefore before `c.env`) exists — there's no way to *literally* skip
 * registration based on a runtime binding. Instead, every handler's first
 * step checks `c.env.ENVIRONMENT` and returns Hono's own `c.notFound()`
 * when it's "production" — a response indistinguishable from the route
 * never having existed, which is what FR-009 actually requires (see
 * research.md's "no secret to leak or forget to rotate" reasoning: this is
 * a deploy-time config value the client can't influence, not a checked
 * secret).
 */
export const devSession = new Hono<AppEnv>();

devSession.post("/", notFoundOutsideDev, rateLimitByIp, async (c) => {
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const email = typeof body.email === "string"
    ? body.email
    : `dev-${crypto.randomUUID()}@example.invalid`;

  const tenant = await createTenant(c.env.DB);
  const user = await createUser(c.env.DB, { tenantId: tenant.id, email });
  const { cookie } = await issueSession(c.env.DB, user.id);

  c.header("Set-Cookie", cookie);
  return c.json({ userId: user.id, tenantId: tenant.id });
});

devSession.post("/invalidate", notFoundOutsideDev, tenantContext, rateLimitBySession, async (c) => {
  const invalidated = await invalidateSession(
    c.env.DB,
    c.env.SESSION_CACHE,
    c.req.header("Cookie") ?? null,
  );
  if (!invalidated) {
    return c.json({ error: "unauthorized" }, 401);
  }
  c.header("Set-Cookie", serializeExpiredSessionCookie());
  return c.json({ invalidated: true });
});
