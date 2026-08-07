import { Hono } from "hono";
import {
  createOrUpdatePushSubscription,
  deletePushSubscriptionByEndpoint,
} from "../../db/repository";
import { rateLimitBySession } from "../../auth/rate-limit";
import { tenantContext } from "../../middleware/tenant-context";
import type { AppEnv } from "../../types";

// Deliberately cookie-only (tenantContext, never tenantContextOrToken) — an API token has no
// service worker to subscribe with, so there's nothing for it to authenticate here (spec 022
// research.md's session-only boundary decision, mirroring specs/017's token-management boundary).
export const push = new Hono<AppEnv>();

push.use("*", tenantContext);

push.get("/vapid-public-key", (c) => {
  // Genuinely absent before the one-time VAPID setup runs in a given environment (types.ts) —
  // distinct from any other error, so the client can show "unavailable" rather than a generic
  // failure (spec 022 FR-003's reasoning applied to setup, not just permission, being unavailable).
  if (!c.env.VAPID_PUBLIC_KEY) {
    return c.json({ error: "push_not_configured" }, 503);
  }
  return c.json({ publicKey: c.env.VAPID_PUBLIC_KEY });
});

type SubscriptionBody = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
};

function validateSubscription(
  body: SubscriptionBody,
): { endpoint: string; p256dh: string; auth: string } | null {
  if (typeof body.endpoint !== "string" || body.endpoint.length === 0) return null;
  if (typeof body.keys?.p256dh !== "string" || body.keys.p256dh.length === 0) return null;
  if (typeof body.keys?.auth !== "string" || body.keys.auth.length === 0) return null;
  return { endpoint: body.endpoint, p256dh: body.keys.p256dh, auth: body.keys.auth };
}

push.post("/subscriptions", rateLimitBySession, async (c) => {
  const body = await c.req.json().catch(() => ({}) as SubscriptionBody);
  const input = validateSubscription(body);
  if (!input) {
    return c.json({ error: "invalid_request" }, 400);
  }

  const subscription = await createOrUpdatePushSubscription(c.env.DB, c.get("tenant"), input);
  return c.json(subscription, 201);
});

push.delete("/subscriptions", rateLimitBySession, async (c) => {
  const body = await c.req.json().catch(() => ({}) as { endpoint?: unknown });
  if (typeof body.endpoint !== "string" || body.endpoint.length === 0) {
    return c.json({ error: "invalid_request" }, 400);
  }

  await deletePushSubscriptionByEndpoint(c.env.DB, c.get("tenant"), body.endpoint);
  return c.body(null, 204);
});
