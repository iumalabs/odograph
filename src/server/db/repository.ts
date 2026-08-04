// The only module in this codebase allowed to import/query the D1 binding
// (constitution Principle I). Every other module resolves tenant scope
// through a TenantContext produced by the session middleware, never a bare
// id, and reaches D1 only by calling functions exported from here.

export type TenantContext = {
  tenantId: string;
  userId: string;
};

export type Tenant = {
  id: string;
};

export type User = {
  id: string;
  tenantId: string;
  email: string;
};

export type Session = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
};

export type ResolvedSession = {
  userId: string;
  tenantId: string;
};

export type ProbeResource = {
  id: string;
  tenantId: string;
};

// --- Bootstrap operations -------------------------------------------------
//
// These create a brand new tenant/user/session from scratch and are only
// ever called by the dev/test session-issuing route (src/server/auth/
// dev-session.ts) or by a future real login-method route once one exists —
// never by a request handler acting on a client-supplied tenant id.

export async function createTenant(db: D1Database): Promise<Tenant> {
  const id = crypto.randomUUID();
  await db.prepare("INSERT INTO tenants (id) VALUES (?)").bind(id).run();
  return { id };
}

export async function createUser(
  db: D1Database,
  input: { tenantId: string; email: string },
): Promise<User> {
  const id = crypto.randomUUID();
  await db
    .prepare("INSERT INTO users (id, tenant_id, email) VALUES (?, ?, ?)")
    .bind(id, input.tenantId, input.email)
    .run();
  return { id, tenantId: input.tenantId, email: input.email };
}

export async function createSession(
  db: D1Database,
  input: { userId: string; tokenHash: string; expiresAt: string },
): Promise<Session> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)",
    )
    .bind(id, input.userId, input.tokenHash, input.expiresAt)
    .run();
  return { id, userId: input.userId, tokenHash: input.tokenHash, expiresAt: input.expiresAt };
}

// --- Session resolution ----------------------------------------------------

/**
 * Resolves a token hash to {userId, tenantId} only if the session is
 * currently valid (not invalidated, not expired) and its user/tenant still
 * exist. A dangling reference (FR-008) can't actually occur — deleting a
 * user cascades to delete their sessions — but the JOIN falling through to
 * `null` is what makes that true rather than assumed.
 */
export async function findValidSessionByTokenHash(
  db: D1Database,
  tokenHash: string,
): Promise<ResolvedSession | null> {
  const now = new Date().toISOString();
  const row = await db
    .prepare(
      `SELECT sessions.user_id AS userId, users.tenant_id AS tenantId
       FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.token_hash = ?
         AND sessions.invalidated_at IS NULL
         AND sessions.expires_at > ?`,
    )
    .bind(tokenHash, now)
    .first<ResolvedSession>();
  return row ?? null;
}

export async function invalidateSessionByTokenHash(
  db: D1Database,
  tokenHash: string,
): Promise<void> {
  await db
    .prepare(
      "UPDATE sessions SET invalidated_at = ? WHERE token_hash = ? AND invalidated_at IS NULL",
    )
    .bind(new Date().toISOString(), tokenHash)
    .run();
}

export async function findUserById(db: D1Database, userId: string): Promise<User | null> {
  const row = await db
    .prepare("SELECT id, tenant_id AS tenantId, email FROM users WHERE id = ?")
    .bind(userId)
    .first<User>();
  return row ?? null;
}

export async function deleteUser(db: D1Database, userId: string): Promise<void> {
  await db.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
}

// --- Tenant-scoped operations ----------------------------------------------
//
// Every function below takes a resolved TenantContext (never a bare id from
// a caller) and scopes its query by ctx.tenantId internally.

export async function createProbeResource(
  db: D1Database,
  ctx: TenantContext,
): Promise<ProbeResource> {
  const id = crypto.randomUUID();
  await db
    .prepare("INSERT INTO probe_resources (id, tenant_id) VALUES (?, ?)")
    .bind(id, ctx.tenantId)
    .run();
  return { id, tenantId: ctx.tenantId };
}

/**
 * Returns null both when no row has this id and when the row exists but
 * belongs to a different tenant — the two cases are indistinguishable by
 * design (spec.md Acceptance Scenario 1).
 */
export async function findProbeResourceById(
  db: D1Database,
  ctx: TenantContext,
  id: string,
): Promise<ProbeResource | null> {
  const row = await db
    .prepare("SELECT id, tenant_id AS tenantId FROM probe_resources WHERE id = ? AND tenant_id = ?")
    .bind(id, ctx.tenantId)
    .first<ProbeResource>();
  return row ?? null;
}
