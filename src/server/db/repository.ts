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

export type Vehicle = {
  id: string;
  tenantId: string;
  name: string;
  make: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
  odometerUnit: "km" | "mi";
  createdAt: string;
  updatedAt: string;
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

const VEHICLE_COLUMNS =
  "id, tenant_id AS tenantId, name, make, model, year, vin, odometer_unit AS odometerUnit, created_at AS createdAt, updated_at AS updatedAt";

export type VehicleInput = {
  name: string;
  make: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
  odometerUnit: "km" | "mi";
};

export async function createVehicle(
  db: D1Database,
  ctx: TenantContext,
  input: VehicleInput,
): Promise<Vehicle> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO vehicles (id, tenant_id, name, make, model, year, vin, odometer_unit, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      ctx.tenantId,
      input.name,
      input.make,
      input.model,
      input.year,
      input.vin,
      input.odometerUnit,
      now,
      now,
    )
    .run();
  return {
    id,
    tenantId: ctx.tenantId,
    name: input.name,
    make: input.make,
    model: input.model,
    year: input.year,
    vin: input.vin,
    odometerUnit: input.odometerUnit,
    createdAt: now,
    updatedAt: now,
  };
}

export async function listVehicles(db: D1Database, ctx: TenantContext): Promise<Vehicle[]> {
  const { results } = await db
    .prepare(`SELECT ${VEHICLE_COLUMNS} FROM vehicles WHERE tenant_id = ? ORDER BY created_at`)
    .bind(ctx.tenantId)
    .all<Vehicle>();
  return results;
}

/**
 * Returns null both when no row has this id and when the row exists but
 * belongs to a different tenant — the two cases are indistinguishable by
 * design (FR-007, same contract findProbeResourceById established).
 */
export async function findVehicleById(
  db: D1Database,
  ctx: TenantContext,
  id: string,
): Promise<Vehicle | null> {
  const row = await db
    .prepare(`SELECT ${VEHICLE_COLUMNS} FROM vehicles WHERE id = ? AND tenant_id = ?`)
    .bind(id, ctx.tenantId)
    .first<Vehicle>();
  return row ?? null;
}

/**
 * Applies only the fields present in `patch` — everything else keeps its
 * stored value (FR-005/SC-003). Returns null under the same
 * not-found-or-not-yours contract as findVehicleById.
 */
export async function updateVehicle(
  db: D1Database,
  ctx: TenantContext,
  id: string,
  patch: Partial<VehicleInput>,
): Promise<Vehicle | null> {
  const existing = await findVehicleById(db, ctx, id);
  if (!existing) return null;

  const merged: VehicleInput = {
    name: patch.name ?? existing.name,
    make: "make" in patch ? patch.make ?? null : existing.make,
    model: "model" in patch ? patch.model ?? null : existing.model,
    year: "year" in patch ? patch.year ?? null : existing.year,
    vin: "vin" in patch ? patch.vin ?? null : existing.vin,
    odometerUnit: patch.odometerUnit ?? existing.odometerUnit,
  };
  const updatedAt = new Date().toISOString();

  await db
    .prepare(
      `UPDATE vehicles
       SET name = ?, make = ?, model = ?, year = ?, vin = ?, odometer_unit = ?, updated_at = ?
       WHERE id = ? AND tenant_id = ?`,
    )
    .bind(
      merged.name,
      merged.make,
      merged.model,
      merged.year,
      merged.vin,
      merged.odometerUnit,
      updatedAt,
      id,
      ctx.tenantId,
    )
    .run();

  return { ...existing, ...merged, updatedAt };
}

/**
 * Returns whether a row was actually deleted — false if it didn't exist or
 * belonged to a different tenant, same not-found-or-not-yours contract.
 */
export async function deleteVehicle(
  db: D1Database,
  ctx: TenantContext,
  id: string,
): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM vehicles WHERE id = ? AND tenant_id = ?")
    .bind(id, ctx.tenantId)
    .run();
  return result.meta.changes > 0;
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

// --- Service records ---------------------------------------------------------

export type ServiceRecord = {
  id: string;
  tenantId: string;
  vehicleId: string;
  serviceDate: string;
  description: string;
  odometerReading: number | null;
  cost: number | null;
  notes: string | null;
  duplicateOfId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ServiceRecordInput = {
  serviceDate: string;
  description: string;
  odometerReading: number | null;
  cost: number | null;
  notes: string | null;
};

const SERVICE_RECORD_COLUMNS =
  "id, tenant_id AS tenantId, vehicle_id AS vehicleId, service_date AS serviceDate, description, odometer_reading AS odometerReading, cost, notes, duplicate_of_id AS duplicateOfId, created_at AS createdAt, updated_at AS updatedAt";

/**
 * Semantic duplicate detection (constitution D-005): only compares against unflagged/original
 * records for this vehicle (never chaining duplicate-of-duplicate), same date exactly, same
 * description case-insensitively. Returns the matching record's id, or null.
 */
async function findServiceDuplicateCandidate(
  db: D1Database,
  ctx: TenantContext,
  vehicleId: string,
  input: ServiceRecordInput,
): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT id FROM service_records
       WHERE vehicle_id = ? AND tenant_id = ? AND duplicate_of_id IS NULL
         AND service_date = ? AND LOWER(description) = LOWER(?)
       LIMIT 1`,
    )
    .bind(vehicleId, ctx.tenantId, input.serviceDate, input.description)
    .first<{ id: string }>();
  return row?.id ?? null;
}

/**
 * Bootstrap-shaped like createVehicle — the caller has already resolved
 * `vehicleId` belongs to `ctx.tenantId` (via findVehicleById) before calling
 * this; it trusts that check the same way createVehicle trusts ctx over any
 * client-supplied id.
 */
export async function createServiceRecord(
  db: D1Database,
  ctx: TenantContext,
  vehicleId: string,
  input: ServiceRecordInput,
): Promise<ServiceRecord> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const duplicateOfId = await findServiceDuplicateCandidate(db, ctx, vehicleId, input);
  await db
    .prepare(
      `INSERT INTO service_records
       (id, tenant_id, vehicle_id, service_date, description, odometer_reading, cost, notes, duplicate_of_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      ctx.tenantId,
      vehicleId,
      input.serviceDate,
      input.description,
      input.odometerReading,
      input.cost,
      input.notes,
      duplicateOfId,
      now,
      now,
    )
    .run();
  return {
    id,
    tenantId: ctx.tenantId,
    vehicleId,
    serviceDate: input.serviceDate,
    description: input.description,
    odometerReading: input.odometerReading,
    cost: input.cost,
    notes: input.notes,
    duplicateOfId,
    createdAt: now,
    updatedAt: now,
  };
}

export async function listServiceRecords(
  db: D1Database,
  ctx: TenantContext,
  vehicleId: string,
): Promise<ServiceRecord[]> {
  const { results } = await db
    .prepare(
      `SELECT ${SERVICE_RECORD_COLUMNS} FROM service_records
       WHERE vehicle_id = ? AND tenant_id = ? ORDER BY service_date`,
    )
    .bind(vehicleId, ctx.tenantId)
    .all<ServiceRecord>();
  return results;
}

/**
 * Returns null both when no row has this id and when it belongs to a
 * different tenant — same not-found-or-not-yours contract as
 * findVehicleById (FR-008).
 */
export async function findServiceRecordById(
  db: D1Database,
  ctx: TenantContext,
  id: string,
): Promise<ServiceRecord | null> {
  const row = await db
    .prepare(`SELECT ${SERVICE_RECORD_COLUMNS} FROM service_records WHERE id = ? AND tenant_id = ?`)
    .bind(id, ctx.tenantId)
    .first<ServiceRecord>();
  return row ?? null;
}

/**
 * Applies only the fields present in `patch` — everything else keeps its
 * stored value (FR-006), same pattern updateVehicle established.
 */
export async function updateServiceRecord(
  db: D1Database,
  ctx: TenantContext,
  id: string,
  patch: Partial<ServiceRecordInput>,
): Promise<ServiceRecord | null> {
  const existing = await findServiceRecordById(db, ctx, id);
  if (!existing) return null;

  const merged: ServiceRecordInput = {
    serviceDate: patch.serviceDate ?? existing.serviceDate,
    description: patch.description ?? existing.description,
    odometerReading: "odometerReading" in patch
      ? patch.odometerReading ?? null
      : existing.odometerReading,
    cost: "cost" in patch ? patch.cost ?? null : existing.cost,
    notes: "notes" in patch ? patch.notes ?? null : existing.notes,
  };
  const updatedAt = new Date().toISOString();

  await db
    .prepare(
      `UPDATE service_records
       SET service_date = ?, description = ?, odometer_reading = ?, cost = ?, notes = ?, updated_at = ?
       WHERE id = ? AND tenant_id = ?`,
    )
    .bind(
      merged.serviceDate,
      merged.description,
      merged.odometerReading,
      merged.cost,
      merged.notes,
      updatedAt,
      id,
      ctx.tenantId,
    )
    .run();

  return { ...existing, ...merged, updatedAt };
}

/**
 * Clears a service record's duplicate flag (constitution D-005) — null (not-found-or-not-yours,
 * or nothing to dismiss) if the record doesn't exist, belongs to a different tenant, or isn't
 * currently flagged (contracts/api.md).
 */
export async function dismissServiceRecordDuplicate(
  db: D1Database,
  ctx: TenantContext,
  id: string,
): Promise<ServiceRecord | null> {
  const existing = await findServiceRecordById(db, ctx, id);
  if (!existing || existing.duplicateOfId === null) return null;

  await db
    .prepare("UPDATE service_records SET duplicate_of_id = NULL WHERE id = ? AND tenant_id = ?")
    .bind(id, ctx.tenantId)
    .run();

  return { ...existing, duplicateOfId: null };
}

/**
 * Returns the R2 keys of every attachment that belonged to this record
 * (deleted from D1 via cascade, along with the record itself) — null if the
 * record didn't exist or belonged to a different tenant. repository.ts never
 * touches R2 itself (Principle I); the caller (route layer) uses these keys
 * to delete the matching R2 objects.
 */
export async function deleteServiceRecord(
  db: D1Database,
  ctx: TenantContext,
  id: string,
): Promise<string[] | null> {
  const existing = await findServiceRecordById(db, ctx, id);
  if (!existing) return null;

  const { results } = await db
    .prepare("SELECT r2_key AS r2Key FROM service_record_attachments WHERE service_record_id = ?")
    .bind(id)
    .all<{ r2Key: string }>();

  await db.prepare("DELETE FROM service_records WHERE id = ? AND tenant_id = ?")
    .bind(id, ctx.tenantId)
    .run();

  return results.map((row) => row.r2Key);
}

/**
 * Every attachment R2 key across every service record belonging to this
 * vehicle, without deleting anything — used by deleteVehicle's retrofit
 * (research.md) to clean up R2 before the D1 cascade removes the rows.
 */
export async function listAttachmentKeysForVehicle(
  db: D1Database,
  ctx: TenantContext,
  vehicleId: string,
): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT sra.r2_key AS r2Key FROM service_record_attachments sra
       JOIN service_records sr ON sr.id = sra.service_record_id
       WHERE sr.vehicle_id = ? AND sr.tenant_id = ?`,
    )
    .bind(vehicleId, ctx.tenantId)
    .all<{ r2Key: string }>();
  return results.map((row) => row.r2Key);
}

export type Attachment = {
  id: string;
  tenantId: string;
  serviceRecordId: string;
  r2Key: string;
  contentType: string;
  size: number;
  createdAt: string;
};

const ATTACHMENT_COLUMNS =
  "id, tenant_id AS tenantId, service_record_id AS serviceRecordId, r2_key AS r2Key, content_type AS contentType, size, created_at AS createdAt";

export async function createAttachment(
  db: D1Database,
  ctx: TenantContext,
  input: { id: string; serviceRecordId: string; r2Key: string; contentType: string; size: number },
): Promise<Attachment> {
  const { id } = input;
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO service_record_attachments
       (id, tenant_id, service_record_id, r2_key, content_type, size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, ctx.tenantId, input.serviceRecordId, input.r2Key, input.contentType, input.size, now)
    .run();
  return {
    id,
    tenantId: ctx.tenantId,
    serviceRecordId: input.serviceRecordId,
    r2Key: input.r2Key,
    contentType: input.contentType,
    size: input.size,
    createdAt: now,
  };
}

/**
 * Same not-found-or-not-yours contract as findServiceRecordById (FR-008).
 */
export async function findAttachmentById(
  db: D1Database,
  ctx: TenantContext,
  id: string,
): Promise<Attachment | null> {
  const row = await db
    .prepare(
      `SELECT ${ATTACHMENT_COLUMNS} FROM service_record_attachments WHERE id = ? AND tenant_id = ?`,
    )
    .bind(id, ctx.tenantId)
    .first<Attachment>();
  return row ?? null;
}

export async function listAttachmentsForServiceRecord(
  db: D1Database,
  ctx: TenantContext,
  serviceRecordId: string,
): Promise<Attachment[]> {
  const { results } = await db
    .prepare(
      `SELECT ${ATTACHMENT_COLUMNS} FROM service_record_attachments
       WHERE service_record_id = ? AND tenant_id = ? ORDER BY created_at`,
    )
    .bind(serviceRecordId, ctx.tenantId)
    .all<Attachment>();
  return results;
}

// --- Fuel records --------------------------------------------------------

export type FuelRecord = {
  id: string;
  tenantId: string;
  vehicleId: string;
  fuelDate: string;
  odometerReading: number;
  volume: number;
  cost: number;
  station: string | null;
  notes: string | null;
  duplicateOfId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FuelRecordInput = {
  fuelDate: string;
  odometerReading: number;
  volume: number;
  cost: number;
  station: string | null;
  notes: string | null;
};

export type FuelRecordWithEconomy = FuelRecord & { fuelEconomy: number | null };

const FUEL_RECORD_COLUMNS =
  "id, tenant_id AS tenantId, vehicle_id AS vehicleId, fuel_date AS fuelDate, odometer_reading AS odometerReading, volume, cost, station, notes, duplicate_of_id AS duplicateOfId, created_at AS createdAt, updated_at AS updatedAt";

/** Fuel records only ever match against unflagged/original records (research.md). */
const FUEL_DUPLICATE_ODOMETER_TOLERANCE = 5;

/**
 * Semantic duplicate detection (constitution D-005): same vehicle/tenant, same date exactly, and
 * an odometer reading within the tolerance — the closest match wins. Returns the matching
 * record's id, or null.
 */
async function findFuelDuplicateCandidate(
  db: D1Database,
  ctx: TenantContext,
  vehicleId: string,
  input: FuelRecordInput,
): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT id FROM fuel_records
       WHERE vehicle_id = ? AND tenant_id = ? AND duplicate_of_id IS NULL
         AND fuel_date = ? AND ABS(odometer_reading - ?) <= ?
       ORDER BY ABS(odometer_reading - ?) ASC
       LIMIT 1`,
    )
    .bind(
      vehicleId,
      ctx.tenantId,
      input.fuelDate,
      input.odometerReading,
      FUEL_DUPLICATE_ODOMETER_TOLERANCE,
      input.odometerReading,
    )
    .first<{ id: string }>();
  return row?.id ?? null;
}

export async function createFuelRecord(
  db: D1Database,
  ctx: TenantContext,
  vehicleId: string,
  input: FuelRecordInput,
): Promise<FuelRecord> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const duplicateOfId = await findFuelDuplicateCandidate(db, ctx, vehicleId, input);
  await db
    .prepare(
      `INSERT INTO fuel_records
       (id, tenant_id, vehicle_id, fuel_date, odometer_reading, volume, cost, station, notes, duplicate_of_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      ctx.tenantId,
      vehicleId,
      input.fuelDate,
      input.odometerReading,
      input.volume,
      input.cost,
      input.station,
      input.notes,
      duplicateOfId,
      now,
      now,
    )
    .run();
  return {
    id,
    tenantId: ctx.tenantId,
    vehicleId,
    fuelDate: input.fuelDate,
    odometerReading: input.odometerReading,
    volume: input.volume,
    cost: input.cost,
    station: input.station,
    notes: input.notes,
    duplicateOfId,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * L/100km for km-odometer vehicles, MPG for mi-odometer vehicles (research.md). Returns null
 * (never Infinity/NaN) whenever the distance since the previous fill-up isn't positive —
 * constitution Principle II.
 */
function computeFuelEconomy(
  odometerUnit: "km" | "mi",
  deltaDistance: number,
  volume: number,
): number | null {
  if (deltaDistance <= 0) return null;
  return odometerUnit === "km" ? volume / (deltaDistance / 100) : deltaDistance / volume;
}

/**
 * Fuel economy is never stored — it's derived here, on every read, from the whole vehicle's fuel
 * records ordered by odometer reading (not creation order, since an owner can backfill an earlier
 * fill-up after later ones already exist), so an edit or backfill anywhere always produces correct
 * figures for its neighbors without a separate recomputation step (FR-008). The returned list
 * itself is ordered by fuelDate (display order) — economy is computed in a separate odometer-order
 * pass and attached by id (contracts/api.md).
 */
export async function listFuelRecordsWithEconomy(
  db: D1Database,
  ctx: TenantContext,
  vehicleId: string,
): Promise<FuelRecordWithEconomy[]> {
  const vehicle = await db
    .prepare("SELECT odometer_unit AS odometerUnit FROM vehicles WHERE id = ? AND tenant_id = ?")
    .bind(vehicleId, ctx.tenantId)
    .first<{ odometerUnit: "km" | "mi" }>();
  if (!vehicle) return [];

  const { results } = await db
    .prepare(
      `SELECT ${FUEL_RECORD_COLUMNS} FROM fuel_records WHERE vehicle_id = ? AND tenant_id = ?`,
    )
    .bind(vehicleId, ctx.tenantId)
    .all<FuelRecord>();

  const byOdometer = [...results].sort((a, b) =>
    a.odometerReading - b.odometerReading || a.createdAt.localeCompare(b.createdAt)
  );
  const economyById = new Map<string, number | null>();
  let previous: FuelRecord | null = null;
  for (const record of byOdometer) {
    // A flagged record (constitution D-005) is transparent to the ordering pass: it never
    // receives its own computed figure, and it's skipped when finding the "previous fill-up" for
    // the next unflagged record — neither corrupting a neighbor's economy nor advancing `previous`
    // past it (research.md's exclusion design).
    if (record.duplicateOfId !== null) {
      economyById.set(record.id, null);
      continue;
    }
    economyById.set(
      record.id,
      previous
        ? computeFuelEconomy(
          vehicle.odometerUnit,
          record.odometerReading - previous.odometerReading,
          record.volume,
        )
        : null,
    );
    previous = record;
  }

  return [...results]
    .sort((a, b) => a.fuelDate.localeCompare(b.fuelDate) || a.createdAt.localeCompare(b.createdAt))
    .map((record) => ({ ...record, fuelEconomy: economyById.get(record.id) ?? null }));
}

/**
 * Same not-found-or-not-yours contract as findServiceRecordById (FR-003) — delegates to
 * listFuelRecordsWithEconomy for the record's own vehicle so the detail endpoint's economy figure
 * always agrees with the list endpoint's, never computed independently.
 */
export async function findFuelRecordById(
  db: D1Database,
  ctx: TenantContext,
  id: string,
): Promise<FuelRecordWithEconomy | null> {
  const row = await db
    .prepare(`SELECT ${FUEL_RECORD_COLUMNS} FROM fuel_records WHERE id = ? AND tenant_id = ?`)
    .bind(id, ctx.tenantId)
    .first<FuelRecord>();
  if (!row) return null;

  const withEconomy = await listFuelRecordsWithEconomy(db, ctx, row.vehicleId);
  return withEconomy.find((record) => record.id === id) ?? null;
}

/**
 * Applies only the fields present in `patch` — everything else keeps its stored value, same
 * pattern updateServiceRecord established. Returns the record with fuelEconomy recomputed against
 * the vehicle's current full ordering (FR-008) — never the pre-update figure.
 */
export async function updateFuelRecord(
  db: D1Database,
  ctx: TenantContext,
  id: string,
  patch: Partial<FuelRecordInput>,
): Promise<FuelRecordWithEconomy | null> {
  const existing = await db
    .prepare(`SELECT ${FUEL_RECORD_COLUMNS} FROM fuel_records WHERE id = ? AND tenant_id = ?`)
    .bind(id, ctx.tenantId)
    .first<FuelRecord>();
  if (!existing) return null;

  const merged: FuelRecordInput = {
    fuelDate: patch.fuelDate ?? existing.fuelDate,
    odometerReading: patch.odometerReading ?? existing.odometerReading,
    volume: patch.volume ?? existing.volume,
    cost: patch.cost ?? existing.cost,
    station: "station" in patch ? patch.station ?? null : existing.station,
    notes: "notes" in patch ? patch.notes ?? null : existing.notes,
  };
  const updatedAt = new Date().toISOString();

  await db
    .prepare(
      `UPDATE fuel_records
       SET fuel_date = ?, odometer_reading = ?, volume = ?, cost = ?, station = ?, notes = ?, updated_at = ?
       WHERE id = ? AND tenant_id = ?`,
    )
    .bind(
      merged.fuelDate,
      merged.odometerReading,
      merged.volume,
      merged.cost,
      merged.station,
      merged.notes,
      updatedAt,
      id,
      ctx.tenantId,
    )
    .run();

  return findFuelRecordById(db, ctx, id);
}

/**
 * Clears a fuel record's duplicate flag (constitution D-005) — null (not-found-or-not-yours, or
 * nothing to dismiss) if the record doesn't exist, belongs to a different tenant, or isn't
 * currently flagged (contracts/api.md). Returns the record with a freshly-computed fuelEconomy,
 * since a dismissed record now participates normally in the odometer-ordering pass.
 */
export async function dismissFuelRecordDuplicate(
  db: D1Database,
  ctx: TenantContext,
  id: string,
): Promise<FuelRecordWithEconomy | null> {
  const existing = await db
    .prepare(
      "SELECT duplicate_of_id AS duplicateOfId FROM fuel_records WHERE id = ? AND tenant_id = ?",
    )
    .bind(id, ctx.tenantId)
    .first<{ duplicateOfId: string | null }>();
  if (!existing || existing.duplicateOfId === null) return null;

  await db
    .prepare("UPDATE fuel_records SET duplicate_of_id = NULL WHERE id = ? AND tenant_id = ?")
    .bind(id, ctx.tenantId)
    .run();

  return findFuelRecordById(db, ctx, id);
}

/**
 * Returns the R2 keys of every attachment that belonged to this record (deleted from D1 via
 * cascade, along with the record itself) — null if the record didn't exist or belonged to a
 * different tenant. repository.ts never touches R2 itself (Principle I); the caller uses these
 * keys to delete the matching R2 objects.
 */
export async function deleteFuelRecord(
  db: D1Database,
  ctx: TenantContext,
  id: string,
): Promise<string[] | null> {
  const existing = await db
    .prepare("SELECT id FROM fuel_records WHERE id = ? AND tenant_id = ?")
    .bind(id, ctx.tenantId)
    .first();
  if (!existing) return null;

  const { results } = await db
    .prepare("SELECT r2_key AS r2Key FROM fuel_record_attachments WHERE fuel_record_id = ?")
    .bind(id)
    .all<{ r2Key: string }>();

  await db.prepare("DELETE FROM fuel_records WHERE id = ? AND tenant_id = ?")
    .bind(id, ctx.tenantId)
    .run();

  return results.map((row) => row.r2Key);
}

/**
 * Every attachment R2 key across every fuel record belonging to this vehicle, without deleting
 * anything — used by deleteVehicle's retrofit to clean up R2 before the D1 cascade removes the
 * rows, alongside the equivalent service-record helper.
 */
export async function listAttachmentKeysForVehicleFuelRecords(
  db: D1Database,
  ctx: TenantContext,
  vehicleId: string,
): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT fra.r2_key AS r2Key FROM fuel_record_attachments fra
       JOIN fuel_records fr ON fr.id = fra.fuel_record_id
       WHERE fr.vehicle_id = ? AND fr.tenant_id = ?`,
    )
    .bind(vehicleId, ctx.tenantId)
    .all<{ r2Key: string }>();
  return results.map((row) => row.r2Key);
}

export type FuelAttachment = {
  id: string;
  tenantId: string;
  fuelRecordId: string;
  r2Key: string;
  contentType: string;
  size: number;
  createdAt: string;
};

const FUEL_ATTACHMENT_COLUMNS =
  "id, tenant_id AS tenantId, fuel_record_id AS fuelRecordId, r2_key AS r2Key, content_type AS contentType, size, created_at AS createdAt";

export async function createFuelAttachment(
  db: D1Database,
  ctx: TenantContext,
  input: { id: string; fuelRecordId: string; r2Key: string; contentType: string; size: number },
): Promise<FuelAttachment> {
  const { id } = input;
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO fuel_record_attachments
       (id, tenant_id, fuel_record_id, r2_key, content_type, size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, ctx.tenantId, input.fuelRecordId, input.r2Key, input.contentType, input.size, now)
    .run();
  return {
    id,
    tenantId: ctx.tenantId,
    fuelRecordId: input.fuelRecordId,
    r2Key: input.r2Key,
    contentType: input.contentType,
    size: input.size,
    createdAt: now,
  };
}

/**
 * Same not-found-or-not-yours contract as findFuelRecordById (FR-003).
 */
export async function findFuelAttachmentById(
  db: D1Database,
  ctx: TenantContext,
  id: string,
): Promise<FuelAttachment | null> {
  const row = await db
    .prepare(
      `SELECT ${FUEL_ATTACHMENT_COLUMNS} FROM fuel_record_attachments WHERE id = ? AND tenant_id = ?`,
    )
    .bind(id, ctx.tenantId)
    .first<FuelAttachment>();
  return row ?? null;
}

export async function listAttachmentsForFuelRecord(
  db: D1Database,
  ctx: TenantContext,
  fuelRecordId: string,
): Promise<FuelAttachment[]> {
  const { results } = await db
    .prepare(
      `SELECT ${FUEL_ATTACHMENT_COLUMNS} FROM fuel_record_attachments
       WHERE fuel_record_id = ? AND tenant_id = ? ORDER BY created_at`,
    )
    .bind(fuelRecordId, ctx.tenantId)
    .all<FuelAttachment>();
  return results;
}
