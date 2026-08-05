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

export type WebAuthnCredentialRecord = {
  id: string;
  userId: string;
  publicKey: Uint8Array;
  counter: number;
  transports: string[] | null;
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

// --- Passkey (WebAuthn) operations ------------------------------------------

/**
 * True when a D1 error is a UNIQUE constraint violation — D1 doesn't expose a
 * structured error code, only a message from the underlying SQLite driver
 * (e.g. "D1_ERROR: UNIQUE constraint failed: webauthn_credentials.id:
 * SQLITE_CONSTRAINT"), so callers that need to distinguish "already exists"
 * from other failures check the message shape via this helper.
 */
export function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("UNIQUE constraint failed");
}

/**
 * Registration bootstrap (User Story 1): creates a tenant, a user, and their
 * first passkey credential atomically via D1's batch() — nothing is created
 * unless every statement succeeds (FR-010). Throws (isUniqueConstraintError)
 * if the credential id is already registered to any account (FR-006) — never
 * called with a caller-supplied tenant/user id, mirroring createTenant/
 * createUser's bootstrap-only contract.
 */
export async function createCredentialedUser(
  db: D1Database,
  input: {
    email: string;
    credentialId: string;
    publicKey: Uint8Array;
    counter: number;
    transports: string[] | null;
  },
): Promise<{ tenantId: string; userId: string }> {
  const tenantId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  await db.batch([
    db.prepare("INSERT INTO tenants (id) VALUES (?)").bind(tenantId),
    db.prepare("INSERT INTO users (id, tenant_id, email) VALUES (?, ?, ?)").bind(
      userId,
      tenantId,
      input.email,
    ),
    db.prepare(
      "INSERT INTO webauthn_credentials (id, user_id, public_key, counter, transports) VALUES (?, ?, ?, ?, ?)",
    ).bind(
      input.credentialId,
      userId,
      input.publicKey.buffer as ArrayBuffer,
      input.counter,
      input.transports ? JSON.stringify(input.transports) : null,
    ),
  ]);
  return { tenantId, userId };
}

export async function findCredentialById(
  db: D1Database,
  credentialId: string,
): Promise<WebAuthnCredentialRecord | null> {
  const row = await db
    .prepare(
      "SELECT id, user_id AS userId, public_key AS publicKey, counter, transports FROM webauthn_credentials WHERE id = ?",
    )
    .bind(credentialId)
    .first<{
      id: string;
      userId: string;
      publicKey: ArrayBuffer;
      counter: number;
      transports: string | null;
    }>();
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    publicKey: new Uint8Array(row.publicKey),
    counter: row.counter,
    transports: row.transports ? JSON.parse(row.transports) : null,
  };
}

/**
 * User Story 3 — adds a passkey to an already-authenticated user. Relies on
 * webauthn_credentials.id's primary-key uniqueness (isUniqueConstraintError)
 * to reject a credential already registered elsewhere (FR-006), rather than
 * checking-then-inserting.
 */
export async function addCredentialToUser(
  db: D1Database,
  input: {
    userId: string;
    credentialId: string;
    publicKey: Uint8Array;
    counter: number;
    transports: string[] | null;
  },
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO webauthn_credentials (id, user_id, public_key, counter, transports) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(
      input.credentialId,
      input.userId,
      input.publicKey.buffer as ArrayBuffer,
      input.counter,
      input.transports ? JSON.stringify(input.transports) : null,
    )
    .run();
}

export async function updateCredentialCounter(
  db: D1Database,
  credentialId: string,
  counter: number,
): Promise<void> {
  await db
    .prepare("UPDATE webauthn_credentials SET counter = ? WHERE id = ?")
    .bind(counter, credentialId)
    .run();
}

const CHALLENGE_TTL_SECONDS = 5 * 60;

export async function createChallenge(
  db: D1Database,
  purpose: "registration" | "authentication",
): Promise<string> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const challenge = base64UrlEncode(bytes);
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_SECONDS * 1000).toISOString();
  await db
    .prepare("INSERT INTO webauthn_challenges (challenge, purpose, expires_at) VALUES (?, ?, ?)")
    .bind(challenge, purpose, expiresAt)
    .run();
  return challenge;
}

/**
 * Atomically checks validity and deletes — a challenge can be consumed at
 * most once (FR-007). Returns whether it was valid; callers reject the
 * ceremony (400) on false.
 */
export async function consumeChallenge(
  db: D1Database,
  challenge: string,
  purpose: "registration" | "authentication",
): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      "DELETE FROM webauthn_challenges WHERE challenge = ? AND purpose = ? AND expires_at > ?",
    )
    .bind(challenge, purpose, now)
    .run();
  return result.meta.changes > 0;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// --- Magic link operations ---------------------------------------------------
//
// "Has this email signed up via magic link before" is answered by querying
// magic_link_identities — never by querying users.email, which is
// deliberately non-unique across tenants (see the `users` entity note
// above). Querying users.email here would silently auto-link this method to
// an account created by a different one, which D-004 prohibits.

export async function findMagicLinkIdentityByEmail(
  db: D1Database,
  email: string,
): Promise<{ userId: string } | null> {
  const row = await db
    .prepare("SELECT user_id AS userId FROM magic_link_identities WHERE email = ?")
    .bind(email)
    .first<{ userId: string }>();
  return row ?? null;
}

/**
 * Registration bootstrap (User Story 1): creates a tenant, a user, and their
 * magic-link identity atomically via D1's batch() — nothing is created
 * unless every statement succeeds (FR-002). Never called with a
 * caller-supplied tenant/user id, mirroring createTenant/createUser and
 * passkey's createCredentialedUser.
 */
export async function createMagicLinkUser(
  db: D1Database,
  email: string,
): Promise<{ tenantId: string; userId: string }> {
  const tenantId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  await db.batch([
    db.prepare("INSERT INTO tenants (id) VALUES (?)").bind(tenantId),
    db.prepare("INSERT INTO users (id, tenant_id, email) VALUES (?, ?, ?)").bind(
      userId,
      tenantId,
      email,
    ),
    db.prepare("INSERT INTO magic_link_identities (email, user_id) VALUES (?, ?)").bind(
      email,
      userId,
    ),
  ]);
  return { tenantId, userId };
}

const MAGIC_LINK_TOKEN_TTL_SECONDS = 15 * 60;

/**
 * Deletes any existing unconsumed token for `email` and inserts a fresh one,
 * in one function so no caller can invalidate without also issuing a
 * replacement, or vice versa (FR-005). Returns the new token value.
 *
 * `linkingUserId` (specs/005) marks this as a linking attempt rather than a
 * sign-in one — NULL for the normal /request path.
 */
export async function invalidateAndCreateMagicLinkToken(
  db: D1Database,
  email: string,
  linkingUserId?: string,
): Promise<string> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = base64UrlEncode(bytes);
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TOKEN_TTL_SECONDS * 1000).toISOString();
  await db.batch([
    db.prepare("DELETE FROM magic_link_tokens WHERE email = ?").bind(email),
    db.prepare(
      "INSERT INTO magic_link_tokens (token, email, expires_at, linking_user_id) VALUES (?, ?, ?, ?)",
    ).bind(
      token,
      email,
      expiresAt,
      linkingUserId ?? null,
    ),
  ]);
  return token;
}

/**
 * Test-only read path (spec.md's "retrieve the token via a test-only hook,
 * not a real inbox") — production code never looks up a token by email,
 * only by the token value itself (consumeMagicLinkToken).
 */
export async function findMagicLinkTokenByEmail(
  db: D1Database,
  email: string,
): Promise<{ token: string; expiresAt: string } | null> {
  const row = await db
    .prepare(
      "SELECT token, expires_at AS expiresAt FROM magic_link_tokens WHERE email = ?",
    )
    .bind(email)
    .first<{ token: string; expiresAt: string }>();
  return row ?? null;
}

/**
 * Atomically checks validity and deletes — a token can be consumed at most
 * once (FR-004). Returns the associated email if it was valid, null
 * otherwise. `linkingUserId` (specs/005) is non-null iff this token was
 * issued by the linking flow rather than a normal sign-in request.
 */
export async function consumeMagicLinkToken(
  db: D1Database,
  token: string,
): Promise<{ email: string; linkingUserId: string | null } | null> {
  const now = new Date().toISOString();
  const row = await db
    .prepare(
      "SELECT email, linking_user_id AS linkingUserId FROM magic_link_tokens WHERE token = ? AND expires_at > ?",
    )
    .bind(token, now)
    .first<{ email: string; linkingUserId: string | null }>();
  if (!row) return null;
  await db.prepare("DELETE FROM magic_link_tokens WHERE token = ?").bind(token).run();
  return row;
}

/**
 * Account-linking bootstrap (specs/005): attaches `email` to an *existing*
 * user — never creates a tenant/user, unlike createMagicLinkUser. Insert-only
 * with no existence pre-check; throws (isUniqueConstraintError) if the email
 * is already linked to any account, same or different (FR-005) — the
 * relevant PRIMARY KEY constraint being magic_link_identities.email itself.
 */
export async function linkMagicLinkIdentity(
  db: D1Database,
  email: string,
  userId: string,
): Promise<void> {
  await db
    .prepare("INSERT INTO magic_link_identities (email, user_id) VALUES (?, ?)")
    .bind(email, userId)
    .run();
}

// --- OIDC operations ---------------------------------------------------------
//
// "Does this identity-provider account already have an account" is answered by
// querying oidc_identities — never by querying users.email, which is
// deliberately non-unique across tenants (see the `users` entity note above).
// Querying users.email here would silently auto-link this method to an
// account created by a different one, which D-004 prohibits.

export async function findOidcIdentityByProviderAndSubject(
  db: D1Database,
  provider: string,
  subject: string,
): Promise<{ userId: string } | null> {
  const row = await db
    .prepare(
      "SELECT user_id AS userId FROM oidc_identities WHERE provider = ? AND subject = ?",
    )
    .bind(provider, subject)
    .first<{ userId: string }>();
  return row ?? null;
}

/**
 * Registration bootstrap (User Story 1): creates a tenant, a user, and their
 * OIDC identity atomically via D1's batch() — nothing is created unless every
 * statement succeeds (FR-006). Never called with a caller-supplied tenant/
 * user id, mirroring createTenant/createUser, passkey's createCredentialedUser,
 * and magic-link's createMagicLinkUser.
 */
export async function createOidcUser(
  db: D1Database,
  input: { provider: string; subject: string; email: string },
): Promise<{ tenantId: string; userId: string }> {
  const tenantId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  await db.batch([
    db.prepare("INSERT INTO tenants (id) VALUES (?)").bind(tenantId),
    db.prepare("INSERT INTO users (id, tenant_id, email) VALUES (?, ?, ?)").bind(
      userId,
      tenantId,
      input.email,
    ),
    db.prepare(
      "INSERT INTO oidc_identities (provider, subject, user_id) VALUES (?, ?, ?)",
    ).bind(input.provider, input.subject, userId),
  ]);
  return { tenantId, userId };
}

const OIDC_STATE_TTL_SECONDS = 10 * 60;

/**
 * Generates a state/PKCE-verifier pair for one pending "redirect to Google
 * and back" attempt and stores them together, keyed by state (research.md —
 * a high-entropy, single-use, short-TTL D1 row, same shape as
 * webauthn_challenges/magic_link_tokens, deliberately with no additional
 * cookie layer).
 *
 * `linkingUserId` (specs/005) marks this as a linking attempt rather than a
 * sign-in one — NULL for the normal /start path.
 */
export async function createOidcState(
  db: D1Database,
  linkingUserId?: string,
): Promise<{ state: string; codeVerifier: string }> {
  const stateBytes = new Uint8Array(32);
  crypto.getRandomValues(stateBytes);
  const state = base64UrlEncode(stateBytes);

  const verifierBytes = new Uint8Array(32);
  crypto.getRandomValues(verifierBytes);
  const codeVerifier = base64UrlEncode(verifierBytes);

  const expiresAt = new Date(Date.now() + OIDC_STATE_TTL_SECONDS * 1000).toISOString();
  await db
    .prepare(
      "INSERT INTO oidc_states (state, code_verifier, expires_at, linking_user_id) VALUES (?, ?, ?, ?)",
    )
    .bind(state, codeVerifier, expiresAt, linkingUserId ?? null)
    .run();
  return { state, codeVerifier };
}

/**
 * Account-linking bootstrap (specs/005): attaches `(provider, subject)` to
 * an *existing* user — never creates a tenant/user, unlike createOidcUser.
 * Insert-only with no existence pre-check; throws (isUniqueConstraintError)
 * if the identity is already linked to any account, same or different
 * (FR-005) — the relevant PRIMARY KEY constraint being
 * oidc_identities.(provider, subject) itself.
 */
export async function linkOidcIdentity(
  db: D1Database,
  provider: string,
  subject: string,
  userId: string,
): Promise<void> {
  await db
    .prepare("INSERT INTO oidc_identities (provider, subject, user_id) VALUES (?, ?, ?)")
    .bind(provider, subject, userId)
    .run();
}

/**
 * Atomically checks validity and deletes — a state value can be used to
 * complete the flow at most once (data-model.md). Returns the associated PKCE
 * verifier if it was valid, null otherwise.
 */
export async function consumeOidcState(
  db: D1Database,
  state: string,
): Promise<{ codeVerifier: string; linkingUserId: string | null } | null> {
  const now = new Date().toISOString();
  const row = await db
    .prepare(
      "SELECT code_verifier AS codeVerifier, linking_user_id AS linkingUserId FROM oidc_states WHERE state = ? AND expires_at > ?",
    )
    .bind(state, now)
    .first<{ codeVerifier: string; linkingUserId: string | null }>();
  if (!row) return null;
  await db.prepare("DELETE FROM oidc_states WHERE state = ?").bind(state).run();
  return row;
}
