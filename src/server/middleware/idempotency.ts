import { createMiddleware } from "hono/factory";
import { findWriteOperation, recordWriteOperation } from "../db/repository";
import type { AppEnv } from "../types";

/**
 * Opt-in via the `Idempotency-Key` request header (spec 020: offline write queue, constitution
 * Principle III). Absent header = today's exact behavior, no dedup, no change — existing
 * API-token callers (spec 017) that don't know about this header are unaffected.
 *
 * A matching key for this tenant *and this exact method+path* short-circuits *before* the route
 * handler runs, returning the originally-stored response verbatim rather than re-executing —
 * required because some handlers have side effects beyond a single row (e.g. spec 010's
 * duplicate-detection classification), which could observably differ on a second run even though
 * the row itself would be deduped (research.md). Scoping by method+path (not just tenant+key) is
 * deliberate: a key reused across two different routes must never short-circuit the second,
 * unrelated request with the first request's cached response — that would be a silent wrong
 * success, exactly what Principle III forbids.
 *
 * Only 2xx and "real" 4xx outcomes are stored. 401 (session expired) and 429 (rate limited) are
 * deliberately never stored — those are exactly the failure classes spec 020's client-side drain
 * loop treats as transient/retryable, not a final answer worth locking in permanently. 5xx isn't
 * stored either, for the same reason.
 */
export const idempotent = createMiddleware<AppEnv>(async (c, next) => {
  const idempotencyKey = c.req.header("Idempotency-Key");
  if (!idempotencyKey) {
    await next();
    return;
  }

  const tenant = c.get("tenant");
  const existing = await findWriteOperation(
    c.env.DB,
    tenant,
    c.req.method,
    c.req.path,
    idempotencyKey,
  );
  if (existing) {
    // A raw Response, not c.body()/c.json() — the stored status code is a plain runtime number,
    // not one of Hono's literal status-code unions, and a 204 must carry a null body regardless
    // of what (empty) text was stored for it.
    return new Response(existing.statusCode === 204 ? null : existing.responseBody, {
      status: existing.statusCode,
      headers: existing.statusCode === 204 ? {} : { "Content-Type": "application/json" },
    });
  }

  await next();

  const status = c.res.status;
  const shouldStore = status < 300 ||
    (status >= 400 && status < 500 && status !== 401 && status !== 429);
  if (shouldStore) {
    const responseBody = await c.res.clone().text();
    await recordWriteOperation(c.env.DB, tenant, {
      idempotencyKey,
      method: c.req.method,
      path: c.req.path,
      statusCode: status,
      responseBody,
    });
  }
});
