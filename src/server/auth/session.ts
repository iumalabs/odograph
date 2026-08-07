import {
  createSession as dbCreateSession,
  findValidSessionByTokenHash,
  invalidateSessionByTokenHash,
  type ResolvedSession,
} from "../db/repository";

const COOKIE_NAME = "odograph_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
// Cache-aside, not source of truth (see research.md) — invalidation deletes
// this entry explicitly, so the TTL is only a backstop, not the correctness
// mechanism.
const CACHE_TTL_SECONDS = 60 * 5;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Exported for reuse by API tokens (spec 017), which hash a differently-shaped credential
// (prefixed, not a session cookie value) through the same digest.
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Exported for reuse by API tokens (spec 017) — the same "32 random bytes, base64url" shape,
// just with a different prefix applied by the caller before hashing.
export function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

function kvCacheKey(tokenHash: string): string {
  return `session:${tokenHash}`;
}

function parseSessionToken(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) continue;
    const name = part.slice(0, separatorIndex).trim();
    if (name === COOKIE_NAME) {
      return part.slice(separatorIndex + 1).trim() || null;
    }
  }
  return null;
}

export function serializeSessionCookie(token: string): string {
  return `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function serializeExpiredSessionCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

export async function issueSession(
  db: D1Database,
  userId: string,
): Promise<{ token: string; cookie: string }> {
  const token = generateToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  await dbCreateSession(db, { userId, tokenHash, expiresAt });
  return { token, cookie: serializeSessionCookie(token) };
}

export type ResolvedSessionWithTokenHash = ResolvedSession & { tokenHash: string };

/**
 * Resolves the session cookie in `cookieHeader` to {userId, tenantId,
 * tokenHash}. Checks the KV cache first; on a miss, falls through to the D1
 * source of truth and repopulates the cache. Returns null for anything
 * invalid — no cookie, unparseable cookie, or a token that D1 doesn't
 * recognize as currently valid. `tokenHash` is included so callers (e.g.
 * the rate limiter) can key per-session without re-parsing the cookie.
 */
export async function resolveSession(
  db: D1Database,
  kv: KVNamespace,
  cookieHeader: string | null,
): Promise<ResolvedSessionWithTokenHash | null> {
  const token = parseSessionToken(cookieHeader);
  if (!token) return null;
  const tokenHash = await sha256Hex(token);

  const cached = await kv.get<ResolvedSession>(kvCacheKey(tokenHash), "json");
  if (cached) return { ...cached, tokenHash };

  const resolved = await findValidSessionByTokenHash(db, tokenHash);
  if (!resolved) return null;

  await kv.put(kvCacheKey(tokenHash), JSON.stringify(resolved), {
    expirationTtl: CACHE_TTL_SECONDS,
  });
  return { ...resolved, tokenHash };
}

/**
 * Invalidates the session referenced by `cookieHeader`, if any. Returns
 * false (no-op) when there was no currently-valid session to invalidate, so
 * callers can respond 401 rather than pretending an invalidation happened.
 */
export async function invalidateSession(
  db: D1Database,
  kv: KVNamespace,
  cookieHeader: string | null,
): Promise<boolean> {
  const token = parseSessionToken(cookieHeader);
  if (!token) return false;
  const tokenHash = await sha256Hex(token);

  const resolved = await findValidSessionByTokenHash(db, tokenHash);
  if (!resolved) return false;

  await invalidateSessionByTokenHash(db, tokenHash);
  await kv.delete(kvCacheKey(tokenHash));
  return true;
}

/**
 * Deletes a session's cache-aside KV entry directly, without touching D1. Needed after account
 * erasure: the `sessions` row is already cascade-deleted by that point, so `invalidateSession`
 * would no-op (it looks the row up first and returns early) and leave a stale cache entry able to
 * resolve the deleted account's session for up to CACHE_TTL_SECONDS longer (research.md).
 */
export async function clearSessionCache(kv: KVNamespace, tokenHash: string): Promise<void> {
  await kv.delete(kvCacheKey(tokenHash));
}
