import { createMiddleware } from "hono/factory";
import { resolveSession, sha256Hex } from "../auth/session";
import { findValidApiTokenByHash, touchApiTokenLastUsed } from "../db/repository";
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

/**
 * Like tenantContext, but also accepts an `Authorization: Bearer <token>` API token as an
 * alternative to the session cookie (constitution Principle VI, spec 017) — used only by the
 * resource routes a token is meant to reach (vehicles/service-records/fuel-records/reminder-rules).
 * Deliberately NOT used by whoami, token management, or account deletion, which stay on the
 * original cookie-only tenantContext above (research.md's session-only boundary decision) — a
 * bearer token, including a read-write one, must never be usable for those.
 *
 * Session cookie is tried first. On a token match, `sessionTokenHash` is set to the *token's* hash
 * — the same Variable rateLimitBySession already reads, so it throttles token-authenticated
 * callers with zero changes to rate-limit.ts (research.md). A read-scoped token is blocked from
 * every non-GET/HEAD method here, centrally, before any route handler runs (research.md).
 */
export const tenantContextOrToken = createMiddleware<AppEnv>(async (c, next) => {
  const resolved = await resolveSession(
    c.env.DB,
    c.env.SESSION_CACHE,
    c.req.header("Cookie") ?? null,
  );

  if (resolved) {
    c.set("tenant", { tenantId: resolved.tenantId, userId: resolved.userId });
    c.set("sessionTokenHash", resolved.tokenHash);
    c.set("authScope", "session");
    await next();
    return;
  }

  const authHeader = c.req.header("Authorization") ?? "";
  const bearerMatch = /^Bearer (.+)$/.exec(authHeader);
  const bearerToken = bearerMatch?.[1];
  if (!bearerToken) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const tokenHash = await sha256Hex(bearerToken);
  const resolvedToken = await findValidApiTokenByHash(c.env.DB, tokenHash);
  if (!resolvedToken) {
    return c.json({ error: "unauthorized" }, 401);
  }

  await touchApiTokenLastUsed(c.env.DB, resolvedToken.apiTokenId);

  if (resolvedToken.scope === "read" && !["GET", "HEAD"].includes(c.req.method)) {
    return c.json({ error: "read_only_token" }, 403);
  }

  c.set("tenant", { tenantId: resolvedToken.tenantId, userId: resolvedToken.userId });
  c.set("sessionTokenHash", tokenHash);
  c.set("authScope", resolvedToken.scope);
  await next();
});
