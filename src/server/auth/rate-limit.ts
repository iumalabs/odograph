import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import type { AppEnv } from "../types";

export const WINDOW_SECONDS = 60;
export const MAX_REQUESTS_PER_WINDOW = 30;

function windowKey(clientKey: string, windowStart: number): string {
  return `ratelimit:${clientKey}:${windowStart}`;
}

/**
 * Fixed-window write-path throttle (constitution Principle VII, FR-007). A
 * KV write race under concurrent requests in the same window can
 * under-count by a request or two — acceptable for a resilience backstop,
 * not a correctness guarantee (see research.md).
 *
 * `getClientKey` is pluggable because not every write route has a resolved
 * session to key by: session *creation* (`POST /_dev/session`) is
 * necessarily unauthenticated, so it's keyed by connecting IP instead of a
 * session token hash. Routes that already ran `tenantContext` should key by
 * `sessionTokenHash` (see `rateLimitBySession` below).
 */
function createRateLimiter(getClientKey: (c: Context<AppEnv>) => string) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const clientKey = getClientKey(c);
    const windowStart = Math.floor(Date.now() / 1000 / WINDOW_SECONDS) * WINDOW_SECONDS;
    const key = windowKey(clientKey, windowStart);

    const current = Number((await c.env.SESSION_CACHE.get(key)) ?? "0");
    if (current >= MAX_REQUESTS_PER_WINDOW) {
      const retryAfter = windowStart + WINDOW_SECONDS - Math.floor(Date.now() / 1000);
      c.header("Retry-After", String(retryAfter));
      return c.json({ error: "rate_limited" }, 429);
    }

    await c.env.SESSION_CACHE.put(key, String(current + 1), {
      expirationTtl: WINDOW_SECONDS,
    });
    await next();
  });
}

/** For write routes behind `tenantContext` — keyed by the resolved session. */
export const rateLimitBySession = createRateLimiter((c) => c.get("sessionTokenHash"));

/** For unauthenticated write routes (session creation itself) — keyed by IP. */
export const rateLimitByIp = createRateLimiter(
  (c) => c.req.header("CF-Connecting-IP") ?? "unknown",
);
