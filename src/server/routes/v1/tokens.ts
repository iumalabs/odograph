import { Hono } from "hono";
import { createApiToken, listApiTokens, revokeApiToken } from "../../db/repository";
import { generateToken, sha256Hex } from "../../auth/session";
import { rateLimitBySession } from "../../auth/rate-limit";
import { tenantContext } from "../../middleware/tenant-context";
import type { AppEnv } from "../../types";

// Deliberately cookie-only (tenantContext, never tenantContextOrToken) — token management must
// never be reachable with a bearer token, including a read-write one (FR-006, research.md's
// session-only boundary decision).
export const tokens = new Hono<AppEnv>();

tokens.use("*", tenantContext);

const TOKEN_PREFIX = "odo_";
const SCOPES = new Set(["read", "write"]);

type CreateBody = {
  label?: unknown;
  scope?: unknown;
};

tokens.post("/", rateLimitBySession, async (c) => {
  const body = await c.req.json().catch(() => ({}) as CreateBody);
  if (typeof body.label !== "string" || body.label.length === 0) {
    return c.json({ error: "invalid_request" }, 400);
  }
  if (typeof body.scope !== "string" || !SCOPES.has(body.scope)) {
    return c.json({ error: "invalid_request" }, 400);
  }
  const scope = body.scope as "read" | "write";

  const plaintext = `${TOKEN_PREFIX}${generateToken()}`;
  const tokenHash = await sha256Hex(plaintext);

  const created = await createApiToken(c.env.DB, c.get("tenant"), {
    label: body.label,
    scope,
    tokenHash,
  });

  return c.json({ ...created, token: plaintext }, 201);
});

tokens.get("/", async (c) => {
  const results = await listApiTokens(c.env.DB, c.get("tenant"));
  return c.json({ tokens: results });
});

tokens.delete("/:id", rateLimitBySession, async (c) => {
  const revoked = await revokeApiToken(c.env.DB, c.get("tenant"), c.req.param("id"));
  if (!revoked) return c.notFound();
  return c.body(null, 204);
});
