import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { createTenant, createUser } from "../db/repository";
import { invalidateSession, issueSession, serializeExpiredSessionCookie } from "./session";
import { rateLimitBySession } from "./rate-limit";
import { tenantContext } from "../middleware/tenant-context";
import type { AppEnv } from "../types";

/**
 * Runs first, before any other middleware, so a production deploy does
 * nothing at all for this route — no rate-limit counter write, no session
 * lookup — not just an early return from within the handler.
 */
export const notFoundOutsideDev = createMiddleware<AppEnv>(async (c, next) => {
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

// Not rate-limited, unlike the real auth endpoints this stands in for (issue #89/#97 CI
// investigation): notFoundOutsideDev already fully removes this route's abuse surface in
// production (404, no counter write, before any other middleware runs) — rate-limiting it too was
// redundant defense-in-depth, not a real security boundary, and its shared IP-keyed budget with
// the real endpoints (rateLimitByIp) started producing false 429s once the e2e suite's own
// session-bootstrap calls got fast enough to bunch into one window. Real endpoints
// (passkey/magic-link/OIDC) keep their rate limiting completely unchanged.
devSession.post("/", notFoundOutsideDev, async (c) => {
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
