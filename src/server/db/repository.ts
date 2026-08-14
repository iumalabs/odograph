// The only module in this codebase allowed to import/query the D1 binding
// (constitution Principle I). Every other module resolves tenant scope
// through a TenantContext produced by the session middleware, never a bare
// id, and reaches D1 only by calling functions exported from here.

import { sendReminderDueEmail } from "../email/reminder-notification";
import { sendReminderPushNotification } from "../push/send-reminder-push";
import { deserializeVapidKeys } from "web-push-browser";
import type { VapidSecrets } from "../types";

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
  // Not settable via the normal create/update API yet (no client form for them) — populated only
  // by one-off data-import migrations (e.g. 0021) until an editing UI exists.
  licensePlate: string | null;
  purchaseDate: string | null;
  purchasePrice: number | null;
  photoR2Key: string | null;
  photoContentType: string | null;
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

/**
 * The entire GDPR erasure mechanism (constitution Principle VIII, spec 016): a single cascading
 * delete of the tenant row removes every table that carries `tenant_id ... ON DELETE CASCADE` or
 * is reachable through `users.id ... ON DELETE CASCADE` (data-model.md enumerates each one) — one
 * atomic D1 statement, not a sequence of per-table deletes that could partially fail (FR-008).
 * Returns whether a row actually existed to delete.
 */
export async function deleteTenantAccount(db: D1Database, tenantId: string): Promise<boolean> {
  const result = await db.prepare("DELETE FROM tenants WHERE id = ?").bind(tenantId).run();
  return result.meta.changes > 0;
}

// --- API tokens (constitution Principle VI, spec 017) ----------------------
//
// A credential table, like sessions/webauthn_credentials/magic_link_identities — keyed by
// user_id, not tenant_id, and cascades away with the owning user (data-model.md).

export type ApiToken = {
  id: string;
  userId: string;
  label: string;
  scope: "read" | "write";
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

const API_TOKEN_COLUMNS =
  "id, user_id AS userId, label, scope, created_at AS createdAt, last_used_at AS lastUsedAt, revoked_at AS revokedAt";

export async function createApiToken(
  db: D1Database,
  ctx: TenantContext,
  input: { label: string; scope: "read" | "write"; tokenHash: string },
): Promise<ApiToken> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO api_tokens (id, user_id, label, scope, token_hash) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(id, ctx.userId, input.label, input.scope, input.tokenHash)
    .run();
  const created = await db
    .prepare(`SELECT ${API_TOKEN_COLUMNS} FROM api_tokens WHERE id = ?`)
    .bind(id)
    .first<ApiToken>();
  if (!created) throw new Error("api token vanished immediately after insert");
  return created;
}

export async function listApiTokens(db: D1Database, ctx: TenantContext): Promise<ApiToken[]> {
  const { results } = await db
    .prepare(`SELECT ${API_TOKEN_COLUMNS} FROM api_tokens WHERE user_id = ? ORDER BY created_at`)
    .bind(ctx.userId)
    .all<ApiToken>();
  return results;
}

/**
 * Resolves a bearer token's hash to {userId, tenantId, apiTokenId, scope} — the token-auth
 * equivalent of findValidSessionByTokenHash, including the same JOIN users shape. Excludes
 * revoked tokens (revoked_at IS NULL), mirroring how findValidSessionByTokenHash excludes
 * invalidated sessions.
 */
export async function findValidApiTokenByHash(
  db: D1Database,
  tokenHash: string,
): Promise<(ResolvedSession & { apiTokenId: string; scope: "read" | "write" }) | null> {
  const row = await db
    .prepare(
      `SELECT api_tokens.id AS apiTokenId, api_tokens.scope AS scope,
              api_tokens.user_id AS userId, users.tenant_id AS tenantId
       FROM api_tokens
       JOIN users ON users.id = api_tokens.user_id
       WHERE api_tokens.token_hash = ?
         AND api_tokens.revoked_at IS NULL`,
    )
    .bind(tokenHash)
    .first<ResolvedSession & { apiTokenId: string; scope: "read" | "write" }>();
  return row ?? null;
}

export async function touchApiTokenLastUsed(db: D1Database, apiTokenId: string): Promise<void> {
  await db
    .prepare("UPDATE api_tokens SET last_used_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), apiTokenId)
    .run();
}

/**
 * Sets revoked_at if the token belongs to ctx.userId — deliberately not conditioned on
 * revoked_at IS NULL, so re-revoking an already-revoked token still counts as a match (changes >
 * 0) rather than being indistinguishable from "not found." That distinction is what lets the
 * route return 204 for "already revoked" (contracts/api.md: idempotent) versus 404 for "doesn't
 * exist or isn't yours" — same not-found-or-not-yours contract as deleteVehicle otherwise.
 */
export async function revokeApiToken(
  db: D1Database,
  ctx: TenantContext,
  id: string,
): Promise<boolean> {
  const result = await db
    .prepare("UPDATE api_tokens SET revoked_at = ? WHERE id = ? AND user_id = ?")
    .bind(new Date().toISOString(), id, ctx.userId)
    .run();
  return result.meta.changes > 0;
}

// --- Tenant-scoped operations ----------------------------------------------
//
// Every function below takes a resolved TenantContext (never a bare id from
// a caller) and scopes its query by ctx.tenantId internally.

const VEHICLE_COLUMNS =
  "id, tenant_id AS tenantId, name, make, model, year, vin, odometer_unit AS odometerUnit, license_plate AS licensePlate, purchase_date AS purchaseDate, purchase_price AS purchasePrice, photo_r2_key AS photoR2Key, photo_content_type AS photoContentType, created_at AS createdAt, updated_at AS updatedAt";

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
  clientId?: string,
): Promise<Vehicle> {
  const id = clientId ?? crypto.randomUUID();
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
    licensePlate: null,
    purchaseDate: null,
    purchasePrice: null,
    photoR2Key: null,
    photoContentType: null,
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
 * Sets (or replaces) the vehicle's cover photo — same not-found-or-not-yours contract as
 * updateVehicle. Unlike vehicle_photos gallery tiles, a vehicle has at most one cover photo
 * stored at a fixed R2 key (attachmentKey(tenantId, "vehicles", id, "photo")), so the route
 * layer never needs to delete-then-write across a key change; a re-upload just overwrites the
 * same object in place.
 */
export async function attachVehicleCoverPhoto(
  db: D1Database,
  ctx: TenantContext,
  id: string,
  input: { r2Key: string; contentType: string },
): Promise<Vehicle | null> {
  const updatedAt = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE vehicles SET photo_r2_key = ?, photo_content_type = ?, updated_at = ?
       WHERE id = ? AND tenant_id = ?`,
    )
    .bind(input.r2Key, input.contentType, updatedAt, id, ctx.tenantId)
    .run();
  if (result.meta.changes === 0) return null;
  return findVehicleById(db, ctx, id);
}

/** Clears the vehicle's cover photo fields — the route layer is responsible for deleting the R2
 * object itself (same ordering every other attachment-backed delete route in this codebase
 * uses: D1 update first is fine here since it's a null-out, not a replace, so there's no window
 * where the row points at a deleted object). */
export async function removeVehicleCoverPhoto(
  db: D1Database,
  ctx: TenantContext,
  id: string,
): Promise<Vehicle | null> {
  const updatedAt = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE vehicles SET photo_r2_key = NULL, photo_content_type = NULL, updated_at = ?
       WHERE id = ? AND tenant_id = ?`,
    )
    .bind(updatedAt, id, ctx.tenantId)
    .run();
  if (result.meta.changes === 0) return null;
  return findVehicleById(db, ctx, id);
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

/** The vehicle's own cover photo key (`vehicles.photo_r2_key`), or null if unset — used by
 * deleteVehicle's/account erasure's R2 cleanup retrofit, same reasoning as every other attachment
 * kind (constitution Principle VIII: R2 objects never cascade from a D1 delete). */
export async function findVehicleCoverPhotoKey(
  db: D1Database,
  ctx: TenantContext,
  vehicleId: string,
): Promise<string | null> {
  const row = await db
    .prepare("SELECT photo_r2_key AS r2Key FROM vehicles WHERE id = ? AND tenant_id = ?")
    .bind(vehicleId, ctx.tenantId)
    .first<{ r2Key: string | null }>();
  return row?.r2Key ?? null;
}

/** Every vehicle cover-photo R2 key for this tenant, without deleting anything — used by account
 * erasure (spec 016), alongside the other listAttachmentKeysForTenant* helpers. */
export async function listVehicleCoverPhotoKeysForTenant(
  db: D1Database,
  ctx: TenantContext,
): Promise<string[]> {
  const { results } = await db
    .prepare(
      "SELECT photo_r2_key AS r2Key FROM vehicles WHERE tenant_id = ? AND photo_r2_key IS NOT NULL",
    )
    .bind(ctx.tenantId)
    .all<{ r2Key: string }>();
  return results.map((row) => row.r2Key);
}

// --- Vehicle photo gallery (design mockup's "ФОТО"/"Галерея" screen) -------
//
// Categorized per-vehicle photos, distinct from the single vehicles.photo_r2_key cover photo
// above. r2Key/contentType/size stay null until an image is actually attached — the mockup's own
// add flow creates an empty, categorized tile first, then drops a file onto it as a second step.

export type VehiclePhotoCategory = "general" | "repair" | "damage" | "parts";

export type VehiclePhoto = {
  id: string;
  tenantId: string;
  vehicleId: string;
  category: VehiclePhotoCategory;
  caption: string | null;
  photoDate: string | null;
  odometerReading: number | null;
  serviceRecordId: string | null;
  r2Key: string | null;
  contentType: string | null;
  size: number | null;
  createdAt: string;
  updatedAt: string;
};

export type VehiclePhotoInput = {
  category: VehiclePhotoCategory;
  caption: string | null;
  photoDate: string | null;
  odometerReading: number | null;
  serviceRecordId: string | null;
};

const VEHICLE_PHOTO_COLUMNS =
  "id, tenant_id AS tenantId, vehicle_id AS vehicleId, category, caption, photo_date AS photoDate, odometer_reading AS odometerReading, service_record_id AS serviceRecordId, r2_key AS r2Key, content_type AS contentType, size, created_at AS createdAt, updated_at AS updatedAt";

export async function createVehiclePhoto(
  db: D1Database,
  ctx: TenantContext,
  vehicleId: string,
  input: VehiclePhotoInput,
  clientId?: string,
): Promise<VehiclePhoto> {
  const id = clientId ?? crypto.randomUUID();
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO vehicle_photos
       (id, tenant_id, vehicle_id, category, caption, photo_date, odometer_reading, service_record_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      ctx.tenantId,
      vehicleId,
      input.category,
      input.caption,
      input.photoDate,
      input.odometerReading,
      input.serviceRecordId,
      now,
      now,
    )
    .run();
  return {
    id,
    tenantId: ctx.tenantId,
    vehicleId,
    category: input.category,
    caption: input.caption,
    photoDate: input.photoDate,
    odometerReading: input.odometerReading,
    serviceRecordId: input.serviceRecordId,
    r2Key: null,
    contentType: null,
    size: null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function listVehiclePhotos(
  db: D1Database,
  ctx: TenantContext,
  vehicleId: string,
): Promise<VehiclePhoto[]> {
  const { results } = await db
    .prepare(
      `SELECT ${VEHICLE_PHOTO_COLUMNS} FROM vehicle_photos
       WHERE vehicle_id = ? AND tenant_id = ? ORDER BY created_at`,
    )
    .bind(vehicleId, ctx.tenantId)
    .all<VehiclePhoto>();
  return results;
}

/**
 * Same not-found-or-not-yours contract as findVehicleById.
 */
export async function findVehiclePhotoById(
  db: D1Database,
  ctx: TenantContext,
  id: string,
): Promise<VehiclePhoto | null> {
  const row = await db
    .prepare(`SELECT ${VEHICLE_PHOTO_COLUMNS} FROM vehicle_photos WHERE id = ? AND tenant_id = ?`)
    .bind(id, ctx.tenantId)
    .first<VehiclePhoto>();
  return row ?? null;
}

/**
 * Attaches an uploaded image to an existing (possibly still-empty) photo row — the mockup's own
 * two-step add flow. The route layer is responsible for deleting any previously-attached R2
 * object first when replacing an image (this only ever overwrites the D1 row).
 */
export async function attachVehiclePhotoImage(
  db: D1Database,
  ctx: TenantContext,
  id: string,
  input: { r2Key: string; contentType: string; size: number },
): Promise<VehiclePhoto | null> {
  const updatedAt = new Date().toISOString();
  const result = await db
    .prepare(
      `UPDATE vehicle_photos SET r2_key = ?, content_type = ?, size = ?, updated_at = ?
       WHERE id = ? AND tenant_id = ?`,
    )
    .bind(input.r2Key, input.contentType, input.size, updatedAt, id, ctx.tenantId)
    .run();
  if (result.meta.changes === 0) return null;
  return findVehiclePhotoById(db, ctx, id);
}

/**
 * Applies only the fields present in `patch` — everything else keeps its stored value, same
 * pattern updateServiceRecord/updatePlanCard established. Never touches the attached image;
 * that's attachVehiclePhotoImage's job.
 */
export async function updateVehiclePhoto(
  db: D1Database,
  ctx: TenantContext,
  id: string,
  patch: Partial<VehiclePhotoInput>,
): Promise<VehiclePhoto | null> {
  const existing = await findVehiclePhotoById(db, ctx, id);
  if (!existing) return null;

  const merged: VehiclePhotoInput = {
    category: patch.category ?? existing.category,
    caption: "caption" in patch ? patch.caption ?? null : existing.caption,
    photoDate: "photoDate" in patch ? patch.photoDate ?? null : existing.photoDate,
    odometerReading: "odometerReading" in patch
      ? patch.odometerReading ?? null
      : existing.odometerReading,
    serviceRecordId: "serviceRecordId" in patch
      ? patch.serviceRecordId ?? null
      : existing.serviceRecordId,
  };
  const updatedAt = new Date().toISOString();

  await db
    .prepare(
      `UPDATE vehicle_photos
       SET category = ?, caption = ?, photo_date = ?, odometer_reading = ?, service_record_id = ?, updated_at = ?
       WHERE id = ? AND tenant_id = ?`,
    )
    .bind(
      merged.category,
      merged.caption,
      merged.photoDate,
      merged.odometerReading,
      merged.serviceRecordId,
      updatedAt,
      id,
      ctx.tenantId,
    )
    .run();

  return { ...existing, ...merged, updatedAt };
}

export async function deleteVehiclePhoto(
  db: D1Database,
  ctx: TenantContext,
  id: string,
): Promise<boolean> {
  const { meta } = await db.prepare("DELETE FROM vehicle_photos WHERE id = ? AND tenant_id = ?")
    .bind(id, ctx.tenantId)
    .run();
  return meta.changes > 0;
}

/** Every vehicle_photos R2 key (excluding still-empty tiles) for this vehicle, without deleting
 * anything — used by deleteVehicle's R2 cleanup retrofit, same reasoning as every other
 * attachment kind. No join needed: vehicle_photos already carries its own vehicle_id column. */
export async function listVehiclePhotoKeysForVehicle(
  db: D1Database,
  ctx: TenantContext,
  vehicleId: string,
): Promise<string[]> {
  const { results } = await db
    .prepare(
      "SELECT r2_key AS r2Key FROM vehicle_photos WHERE vehicle_id = ? AND tenant_id = ? AND r2_key IS NOT NULL",
    )
    .bind(vehicleId, ctx.tenantId)
    .all<{ r2Key: string }>();
  return results.map((row) => row.r2Key);
}

/** Every vehicle_photos R2 key for this tenant across every vehicle, without deleting anything —
 * used by account erasure (spec 016), alongside the other listAttachmentKeysForTenant* helpers. */
export async function listVehiclePhotoKeysForTenant(
  db: D1Database,
  ctx: TenantContext,
): Promise<string[]> {
  const { results } = await db
    .prepare(
      "SELECT r2_key AS r2Key FROM vehicle_photos WHERE tenant_id = ? AND r2_key IS NOT NULL",
    )
    .bind(ctx.tenantId)
    .all<{ r2Key: string }>();
  return results.map((row) => row.r2Key);
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
 * Deletes every outstanding magic_link_tokens row for this tenant's user(s), matched by email —
 * the one table with no foreign key to tenants/users at all (research.md), since an ordinary
 * sign-in token is created before the system knows which user it belongs to. Used by account
 * erasure (spec 016) before the tenant cascade runs, so an unused sign-in link for the deleted
 * account's email can't outlive the erasure (FR-005).
 */
export async function deleteOutstandingMagicLinkTokensForTenant(
  db: D1Database,
  ctx: TenantContext,
): Promise<void> {
  await db
    .prepare(
      "DELETE FROM magic_link_tokens WHERE email IN (SELECT email FROM users WHERE tenant_id = ?)",
    )
    .bind(ctx.tenantId)
    .run();
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
  performedBy: "self" | "shop" | null;
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
  performedBy: "self" | "shop" | null;
};

const SERVICE_RECORD_COLUMNS =
  "id, tenant_id AS tenantId, vehicle_id AS vehicleId, service_date AS serviceDate, description, odometer_reading AS odometerReading, cost, notes, performed_by AS performedBy, duplicate_of_id AS duplicateOfId, created_at AS createdAt, updated_at AS updatedAt";

/**
 * Semantic duplicate detection (constitution D-005): only compares against unflagged/original
 * records for this vehicle (never chaining duplicate-of-duplicate), same date exactly, same
 * description case-insensitively.
 *
 * A plain SELECT-then-INSERT here is racy: two concurrent creates for the same vehicle both read
 * "no duplicate exists" before either has committed, and both land with duplicate_of_id NULL
 * (issue #45). Instead, the row is inserted unconditionally with duplicate_of_id NULL, then this
 * single UPDATE...RETURNING classifies it against the row's own SQLite rowid — an implicit column
 * that reflects true commit order and is therefore immune to any JS-side clock skew between
 * racing requests, unlike ordering by created_at would be. Run together in one db.batch() call
 * (atomic, no interleaving with another request's batch): whichever of two racing inserts commits
 * second finds the first already present and flags itself against it; whichever commits first
 * finds nothing earlier and stays the original. "Earlier" is always evaluated against the current
 * committed state at UPDATE time, not a stale pre-insert snapshot, so this is race-safe regardless
 * of how the two requests' statements interleave.
 *
 * The subquery below matches against bound parameters (vehicleId/tenantId/etc. from `input`)
 * rather than correlating against the row being updated via a table alias — D1's SQLite build
 * doesn't support `UPDATE t AS alias SET col = (SELECT ... WHERE x = alias.y)` (confirmed via a
 * local repro: "no such column" for both `alias.col` and the unaliased `table.col` forms). Own
 * rowid is looked up via a small independent nested SELECT, not correlation.
 */
async function insertServiceRecordWithDuplicateDetection(
  db: D1Database,
  ctx: TenantContext,
  vehicleId: string,
  id: string,
  now: string,
  input: ServiceRecordInput,
): Promise<string | null> {
  const insertStmt = db.prepare(
    `INSERT INTO service_records
     (id, tenant_id, vehicle_id, service_date, description, odometer_reading, cost, notes, performed_by, duplicate_of_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
  ).bind(
    id,
    ctx.tenantId,
    vehicleId,
    input.serviceDate,
    input.description,
    input.odometerReading,
    input.cost,
    input.notes,
    input.performedBy,
    now,
    now,
  );
  const classifyStmt = db.prepare(
    `UPDATE service_records
     SET duplicate_of_id = (
       SELECT earlier.id FROM service_records AS earlier
       WHERE earlier.vehicle_id = ?
         AND earlier.tenant_id = ?
         AND earlier.service_date = ?
         AND LOWER(earlier.description) = LOWER(?)
         AND earlier.duplicate_of_id IS NULL
         AND earlier.rowid < (SELECT rowid FROM service_records WHERE id = ?)
       ORDER BY earlier.rowid ASC
       LIMIT 1
     )
     WHERE id = ?
     RETURNING duplicate_of_id AS duplicateOfId`,
  ).bind(vehicleId, ctx.tenantId, input.serviceDate, input.description, id, id);

  const batchResults = await db.batch<{ duplicateOfId: string | null }>([
    insertStmt,
    classifyStmt,
  ]);
  return batchResults[1]?.results[0]?.duplicateOfId ?? null;
}

/**
 * Bootstrap-shaped like createVehicle — the caller has already resolved
 * `vehicleId` belongs to `ctx.tenantId` (via findVehicleById) before calling
 * this; ownership always comes from `ctx`, never from the client, regardless
 * of whether `clientId` is supplied (spec 020: a client may propose the
 * record's own id, for the offline write queue, but never its tenant).
 */
export async function createServiceRecord(
  db: D1Database,
  ctx: TenantContext,
  vehicleId: string,
  input: ServiceRecordInput,
  clientId?: string,
): Promise<ServiceRecord> {
  const id = clientId ?? crypto.randomUUID();
  const now = new Date().toISOString();
  const duplicateOfId = await insertServiceRecordWithDuplicateDetection(
    db,
    ctx,
    vehicleId,
    id,
    now,
    input,
  );
  return {
    id,
    tenantId: ctx.tenantId,
    vehicleId,
    serviceDate: input.serviceDate,
    description: input.description,
    odometerReading: input.odometerReading,
    cost: input.cost,
    notes: input.notes,
    performedBy: input.performedBy,
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
    performedBy: "performedBy" in patch ? patch.performedBy ?? null : existing.performedBy,
  };
  const updatedAt = new Date().toISOString();

  await db
    .prepare(
      `UPDATE service_records
       SET service_date = ?, description = ?, odometer_reading = ?, cost = ?, notes = ?, performed_by = ?, updated_at = ?
       WHERE id = ? AND tenant_id = ?`,
    )
    .bind(
      merged.serviceDate,
      merged.description,
      merged.odometerReading,
      merged.cost,
      merged.notes,
      merged.performedBy,
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

/**
 * Every attachment R2 key for this tenant across every vehicle, without deleting anything — used
 * by account erasure (spec 016) to clean up R2 before the tenant cascade removes the rows. Unlike
 * listAttachmentKeysForVehicle, no join is needed: service_record_attachments already carries its
 * own tenant_id column directly.
 */
export async function listAttachmentKeysForTenant(
  db: D1Database,
  ctx: TenantContext,
): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT r2_key AS r2Key FROM service_record_attachments WHERE tenant_id = ?")
    .bind(ctx.tenantId)
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
 * an odometer reading within the tolerance — the closest match wins.
 *
 * Same race (issue #45) and same fix shape as insertServiceRecordWithDuplicateDetection: insert
 * unconditionally with duplicate_of_id NULL, then classify atomically in the same db.batch() via
 * an UPDATE...RETURNING keyed off SQLite's implicit rowid (true commit order, immune to any
 * JS-side clock skew between racing requests) rather than a stale pre-insert SELECT. "Closest
 * odometer reading wins" is preserved as the primary tie-break among multiple qualifying earlier
 * candidates; rowid both guarantees we never link to a record that didn't exist yet and breaks
 * exact-distance ties deterministically.
 *
 * The subquery below matches against bound parameters (vehicleId/tenantId/etc. from `input`)
 * rather than correlating against the row being updated via a table alias — D1's SQLite build
 * doesn't support `UPDATE t AS alias SET col = (SELECT ... WHERE x = alias.y)` (confirmed via a
 * local repro: "no such column" for both `alias.col` and the unaliased `table.col` forms). Own
 * rowid is looked up via a small independent nested SELECT, not correlation.
 */
async function insertFuelRecordWithDuplicateDetection(
  db: D1Database,
  ctx: TenantContext,
  vehicleId: string,
  id: string,
  now: string,
  input: FuelRecordInput,
): Promise<string | null> {
  const insertStmt = db.prepare(
    `INSERT INTO fuel_records
     (id, tenant_id, vehicle_id, fuel_date, odometer_reading, volume, cost, station, notes, duplicate_of_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
  ).bind(
    id,
    ctx.tenantId,
    vehicleId,
    input.fuelDate,
    input.odometerReading,
    input.volume,
    input.cost,
    input.station,
    input.notes,
    now,
    now,
  );
  const classifyStmt = db.prepare(
    `UPDATE fuel_records
     SET duplicate_of_id = (
       SELECT earlier.id FROM fuel_records AS earlier
       WHERE earlier.vehicle_id = ?
         AND earlier.tenant_id = ?
         AND earlier.fuel_date = ?
         AND ABS(earlier.odometer_reading - ?) <= ?
         AND earlier.duplicate_of_id IS NULL
         AND earlier.rowid < (SELECT rowid FROM fuel_records WHERE id = ?)
       ORDER BY ABS(earlier.odometer_reading - ?) ASC, earlier.rowid ASC
       LIMIT 1
     )
     WHERE id = ?
     RETURNING duplicate_of_id AS duplicateOfId`,
  ).bind(
    vehicleId,
    ctx.tenantId,
    input.fuelDate,
    input.odometerReading,
    FUEL_DUPLICATE_ODOMETER_TOLERANCE,
    id,
    input.odometerReading,
    id,
  );

  const batchResults = await db.batch<{ duplicateOfId: string | null }>([
    insertStmt,
    classifyStmt,
  ]);
  return batchResults[1]?.results[0]?.duplicateOfId ?? null;
}

export async function createFuelRecord(
  db: D1Database,
  ctx: TenantContext,
  vehicleId: string,
  input: FuelRecordInput,
  clientId?: string,
): Promise<FuelRecord> {
  const id = clientId ?? crypto.randomUUID();
  const now = new Date().toISOString();
  const duplicateOfId = await insertFuelRecordWithDuplicateDetection(
    db,
    ctx,
    vehicleId,
    id,
    now,
    input,
  );
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

const KM_TO_MI = 0.621371;
const MI_TO_KM = 1.609344;
// Single literal constant used both ways (matches the mockup's own cons()/vol() reference
// implementation) rather than two independently-rounded constants for each direction — keeps
// forward and reverse conversion consistent (specs/050 research.md).
const L_TO_GAL = 0.264172;

/** Server-side counterpart to src/client/distance.ts's convertDistance (specs/050 research.md —
 * no shared client/server module in this codebase). */
function convertDistance(value: number, from: "km" | "mi", to: "km" | "mi"): number {
  if (from === to) return value;
  return from === "km" ? value * KM_TO_MI : value * MI_TO_KM;
}

/** Volume's unit is implied by its paired distance unit: liters for "km", gallons for "mi" — the
 * same pairing computeFuelEconomy already assumes. */
function convertVolume(value: number, from: "km" | "mi", to: "km" | "mi"): number {
  if (from === to) return value;
  return from === "km" ? value * L_TO_GAL : value / L_TO_GAL;
}

/**
 * Converts deltaDistance/volume into displayUnit's system, then delegates to the existing,
 * already-guarded computeFuelEconomy — never a second, independently-derived formula (specs/050
 * research.md: reciprocally rescaling an already-computed economy number is mathematically wrong
 * for aggregates that average per-record ratios).
 */
function computeFuelEconomyForDisplay(
  nativeUnit: "km" | "mi",
  displayUnit: "km" | "mi",
  deltaDistance: number,
  volume: number,
): number | null {
  if (nativeUnit === displayUnit) return computeFuelEconomy(nativeUnit, deltaDistance, volume);
  return computeFuelEconomy(
    displayUnit,
    convertDistance(deltaDistance, nativeUnit, displayUnit),
    convertVolume(volume, nativeUnit, displayUnit),
  );
}

/**
 * Fuel economy is never stored — it's derived here, on every read, from the whole vehicle's fuel
 * records ordered by odometer reading (not creation order, since an owner can backfill an earlier
 * fill-up after later ones already exist), so an edit or backfill anywhere always produces correct
 * figures for its neighbors without a separate recomputation step (FR-008). The returned list
 * itself is ordered by fuelDate (display order) — economy is computed in a separate odometer-order
 * pass and attached by id (contracts/api.md). `displayUnit` defaults to the vehicle's own native
 * unit, preserving the pre-specs/050 values for every caller that doesn't request a conversion.
 */
export async function listFuelRecordsWithEconomy(
  db: D1Database,
  ctx: TenantContext,
  vehicleId: string,
  displayUnit?: "km" | "mi",
): Promise<FuelRecordWithEconomy[]> {
  const vehicle = await db
    .prepare("SELECT odometer_unit AS odometerUnit FROM vehicles WHERE id = ? AND tenant_id = ?")
    .bind(vehicleId, ctx.tenantId)
    .first<{ odometerUnit: "km" | "mi" }>();
  if (!vehicle) return [];
  const unit = displayUnit ?? vehicle.odometerUnit;

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
        ? computeFuelEconomyForDisplay(
          vehicle.odometerUnit,
          unit,
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

export type FuelPreview = { economy: number | null; costPerDistance: number | null };

/**
 * Server-computed live preview for the fuel-record create form (specs/040, constitution Principle
 * II — this must never move client-side). Finds the vehicle's most recent non-duplicate fuel
 * record by odometer reading — the same lookup listFuelRecordsWithEconomy already performs — and
 * runs the draft odometerReading/volume through the exact same computeFuelEconomy function saved
 * records use, so the preview and the eventual saved value are numerically identical for the same
 * inputs. costPerDistance reuses the same delta, guarded independently for cost.
 */
export async function computeFuelPreview(
  db: D1Database,
  ctx: TenantContext,
  vehicleId: string,
  odometerReading: number,
  volume: number,
  cost: number | null,
  displayUnit?: "km" | "mi",
): Promise<FuelPreview> {
  const vehicle = await db
    .prepare("SELECT odometer_unit AS odometerUnit FROM vehicles WHERE id = ? AND tenant_id = ?")
    .bind(vehicleId, ctx.tenantId)
    .first<{ odometerUnit: "km" | "mi" }>();
  if (!vehicle) return { economy: null, costPerDistance: null };

  const { results } = await db
    .prepare(
      `SELECT ${FUEL_RECORD_COLUMNS} FROM fuel_records WHERE vehicle_id = ? AND tenant_id = ?`,
    )
    .bind(vehicleId, ctx.tenantId)
    .all<FuelRecord>();

  const previous = results
    .filter((record) => record.duplicateOfId === null)
    .reduce<FuelRecord | null>(
      (
        max,
        record,
      ) => (max === null || record.odometerReading > max.odometerReading ? record : max),
      null,
    );
  if (previous === null || volume <= 0) return { economy: null, costPerDistance: null };

  // odometerReading/volume are draft-form inputs, always already in the vehicle's own native unit
  // (specs/047 FR-004 — forms are never unit-toggled); only the computed economy is re-expressed
  // in displayUnit (specs/050 research.md).
  const deltaDistance = odometerReading - previous.odometerReading;
  const economy = computeFuelEconomyForDisplay(
    vehicle.odometerUnit,
    displayUnit ?? vehicle.odometerUnit,
    deltaDistance,
    volume,
  );
  const costPerDistance = cost !== null && cost > 0 && deltaDistance > 0
    ? cost / deltaDistance
    : null;
  return { economy, costPerDistance };
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

/**
 * Every fuel-record attachment R2 key for this tenant across every vehicle, without deleting
 * anything — used by account erasure (spec 016), alongside listAttachmentKeysForTenant. No join
 * needed: fuel_record_attachments already carries its own tenant_id column directly.
 */
export async function listAttachmentKeysForTenantFuelRecords(
  db: D1Database,
  ctx: TenantContext,
): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT r2_key AS r2Key FROM fuel_record_attachments WHERE tenant_id = ?")
    .bind(ctx.tenantId)
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

// --- Documents (specs/023: expiry tracking, spec/fuel-record-style attachments) --------------

export type DocumentCategory = "registration" | "insurance" | "warranty" | "inspection" | "other";

export type DocumentReminderStatus = "on_track" | "coming_up" | "overdue";

export type Document = {
  id: string;
  tenantId: string;
  vehicleId: string;
  title: string;
  category: DocumentCategory;
  expiryDate: string | null;
  notes: string | null;
  isExpired: boolean;
  reminderStatus: DocumentReminderStatus | null;
  /** Fraction of the fixed DOCUMENT_COMING_UP_WINDOW_DAYS window elapsed (specs/045), clamped to 1
   * once expired. Present only when reminderStatus is coming_up/overdue — never a guessed
   * "percent of validity elapsed," since documents have no issued/valid-from date (research.md). */
  windowFraction: number | null;
  cachedStatus: DocumentReminderStatus | null;
  lastEvaluatedAt: string | null;
  lastNotifiedSeverity: "coming_up" | "overdue" | null;
  createdAt: string;
  updatedAt: string;
};

export type DocumentInput = {
  title: string;
  category: DocumentCategory;
  expiryDate: string | null;
  notes: string | null;
};

const DOCUMENT_COLUMNS =
  "id, tenant_id AS tenantId, vehicle_id AS vehicleId, title, category, expiry_date AS expiryDate, notes, cached_status AS cachedStatus, last_evaluated_at AS lastEvaluatedAt, last_notified_severity AS lastNotifiedSeverity, created_at AS createdAt, updated_at AS updatedAt";

type DocumentRow = Omit<Document, "isExpired" | "reminderStatus" | "windowFraction">;

/**
 * "Today" as a date-only string, so it compares correctly against expiry_date's own date-only
 * format (research.md) — a full ISO timestamp would misclassify a same-day expiry depending on
 * time of day.
 */
function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * A document has no interval or "last done" anchor (specs/024 research.md) — a fixed absolute
 * window is the only classification that makes sense for a single fixed expiry_date, unlike
 * reminder_rules' proportional-remaining threshold (classifyRemainingFraction below).
 */
const DOCUMENT_COMING_UP_WINDOW_DAYS = 30;

export type DocumentReminderStatusResult = {
  status: DocumentReminderStatus;
  windowFraction: number | null;
};

/**
 * Pure function, no D1 access — directly unit-testable, same posture as computeReminderStatus.
 * windowFraction (specs/045) is only meaningful once coming_up/overdue — a document has no
 * "issued"/valid-from date, so there's no honest denominator for an on_track document's progress.
 */
export function computeDocumentReminderStatus(
  expiryDate: string,
  now: Date,
): DocumentReminderStatusResult {
  const remainingDays = (Date.parse(expiryDate) - now.getTime()) / 86_400_000;
  if (remainingDays < 0) {
    return { status: "overdue", windowFraction: 1 };
  }
  if (remainingDays <= DOCUMENT_COMING_UP_WINDOW_DAYS) {
    return {
      status: "coming_up",
      windowFraction: Math.min(1, 1 - remainingDays / DOCUMENT_COMING_UP_WINDOW_DAYS),
    };
  }
  return { status: "on_track", windowFraction: null };
}

/**
 * isExpired and reminderStatus are both derived at read time, never from cached_status
 * (specs/024 research.md) — avoids a background job to keep a stored flag from going stale.
 */
function withDocumentStatus(row: DocumentRow): Document {
  const today = todayDateOnly();
  const isExpired = row.expiryDate !== null && row.expiryDate <= today;
  const computed = row.expiryDate !== null
    ? computeDocumentReminderStatus(row.expiryDate, new Date())
    : null;
  return {
    ...row,
    isExpired,
    reminderStatus: computed?.status ?? null,
    windowFraction: computed?.windowFraction ?? null,
  };
}

export async function createDocument(
  db: D1Database,
  ctx: TenantContext,
  vehicleId: string,
  input: DocumentInput,
  clientId?: string,
): Promise<Document> {
  const id = clientId ?? crypto.randomUUID();
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO documents (id, tenant_id, vehicle_id, title, category, expiry_date, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      ctx.tenantId,
      vehicleId,
      input.title,
      input.category,
      input.expiryDate,
      input.notes,
      now,
      now,
    )
    .run();
  return withDocumentStatus({
    id,
    tenantId: ctx.tenantId,
    vehicleId,
    title: input.title,
    category: input.category,
    expiryDate: input.expiryDate,
    notes: input.notes,
    cachedStatus: null,
    lastEvaluatedAt: null,
    lastNotifiedSeverity: null,
    createdAt: now,
    updatedAt: now,
  });
}

export async function listDocuments(
  db: D1Database,
  ctx: TenantContext,
  vehicleId: string,
): Promise<Document[]> {
  const { results } = await db
    .prepare(
      `SELECT ${DOCUMENT_COLUMNS} FROM documents
       WHERE vehicle_id = ? AND tenant_id = ? ORDER BY created_at`,
    )
    .bind(vehicleId, ctx.tenantId)
    .all<DocumentRow>();
  return results.map(withDocumentStatus);
}

/**
 * Returns null both when no row has this id and when it belongs to a different tenant — same
 * not-found-or-not-yours contract as findServiceRecordById (FR-010).
 */
export async function findDocumentById(
  db: D1Database,
  ctx: TenantContext,
  id: string,
): Promise<Document | null> {
  const row = await db
    .prepare(`SELECT ${DOCUMENT_COLUMNS} FROM documents WHERE id = ? AND tenant_id = ?`)
    .bind(id, ctx.tenantId)
    .first<DocumentRow>();
  return row ? withDocumentStatus(row) : null;
}

/**
 * Applies only the fields present in `patch` — everything else keeps its stored value (FR-008),
 * same pattern updateServiceRecord established, including the omitted-vs-null distinction for
 * expiryDate/notes. When `expiryDate` is included (a new value or an explicit null),
 * last_notified_severity is also cleared (specs/024 FR-007) — a renewed or cleared document isn't
 * silently suppressed by escalation state from before the edit.
 */
export async function updateDocument(
  db: D1Database,
  ctx: TenantContext,
  id: string,
  patch: Partial<DocumentInput>,
): Promise<Document | null> {
  const existing = await findDocumentById(db, ctx, id);
  if (!existing) return null;

  const merged: DocumentInput = {
    title: patch.title ?? existing.title,
    category: patch.category ?? existing.category,
    expiryDate: "expiryDate" in patch ? patch.expiryDate ?? null : existing.expiryDate,
    notes: "notes" in patch ? patch.notes ?? null : existing.notes,
  };
  const updatedAt = new Date().toISOString();
  const clearsNotifiedSeverity = "expiryDate" in patch;
  const lastNotifiedSeverity = clearsNotifiedSeverity ? null : existing.lastNotifiedSeverity;

  await db
    .prepare(
      `UPDATE documents
       SET title = ?, category = ?, expiry_date = ?, notes = ?, updated_at = ?${
        clearsNotifiedSeverity ? ", last_notified_severity = NULL" : ""
      }
       WHERE id = ? AND tenant_id = ?`,
    )
    .bind(
      merged.title,
      merged.category,
      merged.expiryDate,
      merged.notes,
      updatedAt,
      id,
      ctx.tenantId,
    )
    .run();

  return withDocumentStatus({ ...existing, ...merged, updatedAt, lastNotifiedSeverity });
}

/**
 * Returns the R2 keys of every attachment that belonged to this document (deleted from D1 via
 * cascade, along with the document itself) — null if the document didn't exist or belonged to a
 * different tenant. repository.ts never touches R2 itself (Principle I); the caller (route layer)
 * uses these keys to delete the matching R2 objects.
 */
export async function deleteDocument(
  db: D1Database,
  ctx: TenantContext,
  id: string,
): Promise<string[] | null> {
  const existing = await findDocumentById(db, ctx, id);
  if (!existing) return null;

  const { results } = await db
    .prepare("SELECT r2_key AS r2Key FROM document_attachments WHERE document_id = ?")
    .bind(id)
    .all<{ r2Key: string }>();

  await db.prepare("DELETE FROM documents WHERE id = ? AND tenant_id = ?")
    .bind(id, ctx.tenantId)
    .run();

  return results.map((row) => row.r2Key);
}

/**
 * Every attachment R2 key across every document belonging to this vehicle, without deleting
 * anything — used by deleteVehicle's retrofit to clean up R2 before the D1 cascade removes the
 * rows.
 */
export async function listAttachmentKeysForVehicleDocuments(
  db: D1Database,
  ctx: TenantContext,
  vehicleId: string,
): Promise<string[]> {
  const { results } = await db
    .prepare(
      `SELECT da.r2_key AS r2Key FROM document_attachments da
       JOIN documents d ON d.id = da.document_id
       WHERE d.vehicle_id = ? AND d.tenant_id = ?`,
    )
    .bind(vehicleId, ctx.tenantId)
    .all<{ r2Key: string }>();
  return results.map((row) => row.r2Key);
}

/**
 * Every attachment R2 key for this tenant across every vehicle, without deleting anything — used
 * by account erasure (spec 016) to clean up R2 before the tenant cascade removes the rows. No join
 * needed: document_attachments already carries its own tenant_id column directly.
 */
export async function listAttachmentKeysForTenantDocuments(
  db: D1Database,
  ctx: TenantContext,
): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT r2_key AS r2Key FROM document_attachments WHERE tenant_id = ?")
    .bind(ctx.tenantId)
    .all<{ r2Key: string }>();
  return results.map((row) => row.r2Key);
}

export type DocumentAttachment = {
  id: string;
  tenantId: string;
  documentId: string;
  r2Key: string;
  contentType: string;
  size: number;
  createdAt: string;
};

const DOCUMENT_ATTACHMENT_COLUMNS =
  "id, tenant_id AS tenantId, document_id AS documentId, r2_key AS r2Key, content_type AS contentType, size, created_at AS createdAt";

export async function createDocumentAttachment(
  db: D1Database,
  ctx: TenantContext,
  input: { id: string; documentId: string; r2Key: string; contentType: string; size: number },
): Promise<DocumentAttachment> {
  const { id } = input;
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO document_attachments
       (id, tenant_id, document_id, r2_key, content_type, size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, ctx.tenantId, input.documentId, input.r2Key, input.contentType, input.size, now)
    .run();
  return {
    id,
    tenantId: ctx.tenantId,
    documentId: input.documentId,
    r2Key: input.r2Key,
    contentType: input.contentType,
    size: input.size,
    createdAt: now,
  };
}

/**
 * Same not-found-or-not-yours contract as findDocumentById (FR-010).
 */
export async function findDocumentAttachmentById(
  db: D1Database,
  ctx: TenantContext,
  id: string,
): Promise<DocumentAttachment | null> {
  const row = await db
    .prepare(
      `SELECT ${DOCUMENT_ATTACHMENT_COLUMNS} FROM document_attachments WHERE id = ? AND tenant_id = ?`,
    )
    .bind(id, ctx.tenantId)
    .first<DocumentAttachment>();
  return row ?? null;
}

export async function listDocumentAttachmentsForDocument(
  db: D1Database,
  ctx: TenantContext,
  documentId: string,
): Promise<DocumentAttachment[]> {
  const { results } = await db
    .prepare(
      `SELECT ${DOCUMENT_ATTACHMENT_COLUMNS} FROM document_attachments
       WHERE document_id = ? AND tenant_id = ? ORDER BY created_at`,
    )
    .bind(documentId, ctx.tenantId)
    .all<DocumentAttachment>();
  return results;
}

/**
 * The Cron-triggered sweep for document expiry reminders (specs/024) — mirrors
 * evaluateAllReminders' exact structure and contract: no TenantContext (evaluates every tenant's
 * documents in one run, same documented cross-tenant exception), persists
 * cached_status/last_evaluated_at per row, isolates a single row's failure so the rest of the
 * sweep still completes, and drives the same email (spec 012) and push (spec 022) side effects —
 * reusing sendReminderDueEmail/sendReminderPushNotification unchanged (research.md's itemLabel
 * generalization) rather than a second notification system. Only documents with a non-null
 * expiry_date are candidates (FR-002) — a document with none is never selected.
 */
export async function evaluateAllDocumentReminders(
  env: Env & VapidSecrets,
): Promise<{ evaluated: number; failed: number; notified: number }> {
  const db = env.DB;
  const { results } = await db
    .prepare(
      `SELECT ${DOCUMENT_COLUMNS} FROM documents WHERE expiry_date IS NOT NULL`,
    )
    .all<DocumentRow>();

  let vapidKeys: CryptoKeyPair | null = null;
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
    try {
      vapidKeys = await deserializeVapidKeys({
        publicKey: env.VAPID_PUBLIC_KEY,
        privateKey: env.VAPID_PRIVATE_KEY,
      });
    } catch {
      vapidKeys = null;
    }
  }

  const now = new Date();
  let evaluated = 0;
  let failed = 0;
  let notified = 0;

  for (const document of results) {
    try {
      // expiry_date is non-null by the WHERE clause above, but the column type is nullable —
      // narrow it explicitly rather than assert.
      if (document.expiryDate === null) continue;
      const { status } = computeDocumentReminderStatus(document.expiryDate, now);
      await db
        .prepare(
          "UPDATE documents SET cached_status = ?, last_evaluated_at = ? WHERE id = ?",
        )
        .bind(status, now.toISOString(), document.id)
        .run();
      evaluated++;

      if (status === "on_track") {
        if (document.lastNotifiedSeverity !== null) {
          await db
            .prepare("UPDATE documents SET last_notified_severity = NULL WHERE id = ?")
            .bind(document.id)
            .run();
        }
      } else {
        const notifiedSeverity = REMINDER_URGENCY[document.lastNotifiedSeverity ?? "on_track"];
        if (REMINDER_URGENCY[status] > notifiedSeverity) {
          const vehicle = await db
            .prepare("SELECT name FROM vehicles WHERE id = ?")
            .bind(document.vehicleId)
            .first<{ name: string }>();
          const vehicleName = vehicle?.name ?? "your vehicle";

          let attempted = false;
          let sent = false;

          const recipient = await findDeliverableReminderRecipient(db, document.tenantId);
          if (recipient !== null) {
            attempted = true;
            const emailResult = await sendReminderDueEmail(env, {
              to: recipient,
              vehicleName,
              itemLabel: document.title,
              status,
            });
            if (emailResult.sent) sent = true;
          }

          if (vapidKeys) {
            const subscriptions = await listPushSubscriptions(db, document.tenantId);
            for (const subscription of subscriptions) {
              attempted = true;
              const pushResult = await sendReminderPushNotification(vapidKeys, subscription, {
                vehicleName,
                itemLabel: document.title,
                status,
              });
              if (pushResult.sent) {
                sent = true;
              } else if (pushResult.expired) {
                await deletePushSubscriptionById(db, subscription.id);
              }
            }
          }

          if (sent) {
            await db
              .prepare("UPDATE documents SET last_notified_severity = ? WHERE id = ?")
              .bind(status, document.id)
              .run();
            notified++;
          } else if (attempted) {
            failed++;
          }
        }
      }
    } catch {
      failed++;
    }
  }

  return { evaluated, failed, notified };
}

// --- Plan cards (specs/025: maintenance planner kanban board) ---------------

export type PlanCardStage = "idea" | "buy" | "doing" | "done";

export type PlanCard = {
  id: string;
  tenantId: string;
  vehicleId: string;
  title: string;
  stage: PlanCardStage;
  targetDate: string | null;
  estimatedCost: number | null;
  urgent: boolean;
  // Not settable via the normal create/update API yet (no client form field) — populated only by
  // one-off data-import migrations (e.g. 0021) until an editing UI exists.
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlanCardInput = {
  title: string;
  targetDate: string | null;
  estimatedCost: number | null;
  urgent: boolean;
};

const PLAN_CARD_COLUMNS =
  "id, tenant_id AS tenantId, vehicle_id AS vehicleId, title, stage, target_date AS targetDate, estimated_cost AS estimatedCost, urgent, notes, created_at AS createdAt, updated_at AS updatedAt";

type PlanCardRow = Omit<PlanCard, "urgent"> & { urgent: number };

function fromPlanCardRow(row: PlanCardRow): PlanCard {
  return { ...row, urgent: row.urgent !== 0 };
}

export async function createPlanCard(
  db: D1Database,
  ctx: TenantContext,
  vehicleId: string,
  input: PlanCardInput,
  clientId?: string,
): Promise<PlanCard> {
  const id = clientId ?? crypto.randomUUID();
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO plan_cards
       (id, tenant_id, vehicle_id, title, stage, target_date, estimated_cost, urgent, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'idea', ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      ctx.tenantId,
      vehicleId,
      input.title,
      input.targetDate,
      input.estimatedCost,
      input.urgent ? 1 : 0,
      now,
      now,
    )
    .run();
  return {
    id,
    tenantId: ctx.tenantId,
    vehicleId,
    title: input.title,
    stage: "idea",
    targetDate: input.targetDate,
    estimatedCost: input.estimatedCost,
    urgent: input.urgent,
    notes: null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function listPlanCards(
  db: D1Database,
  ctx: TenantContext,
  vehicleId: string,
): Promise<PlanCard[]> {
  const { results } = await db
    .prepare(
      `SELECT ${PLAN_CARD_COLUMNS} FROM plan_cards
       WHERE vehicle_id = ? AND tenant_id = ? ORDER BY created_at`,
    )
    .bind(vehicleId, ctx.tenantId)
    .all<PlanCardRow>();
  return results.map(fromPlanCardRow);
}

/**
 * Returns null both when no row has this id and when it belongs to a different tenant — same
 * not-found-or-not-yours contract as findDocumentById (FR-010).
 */
export async function findPlanCardById(
  db: D1Database,
  ctx: TenantContext,
  id: string,
): Promise<PlanCard | null> {
  const row = await db
    .prepare(`SELECT ${PLAN_CARD_COLUMNS} FROM plan_cards WHERE id = ? AND tenant_id = ?`)
    .bind(id, ctx.tenantId)
    .first<PlanCardRow>();
  return row ? fromPlanCardRow(row) : null;
}

/**
 * Applies only the fields present in `patch` — everything else keeps its stored value (FR-006),
 * same pattern updateDocument established. `stage` is validated by the route layer against the
 * four defined values before this is called (FR-005) — this function trusts it's already valid.
 *
 * Done-transition (FR-007/FR-008, data-model.md): when the merged stage becomes "done" and the
 * existing stage wasn't already "done", creates a real service record via the existing
 * createServiceRecord — never a second, parallel record type. Odometer reading and cost are only
 * ever what's actually known (constitution Principle IV) — never fabricated. Re-setting an
 * already-"done" card to "done" is a no-op for this side effect.
 */
export async function updatePlanCard(
  db: D1Database,
  ctx: TenantContext,
  id: string,
  patch: Partial<PlanCardInput> & { stage?: PlanCardStage },
): Promise<PlanCard | null> {
  const existing = await findPlanCardById(db, ctx, id);
  if (!existing) return null;

  const merged: PlanCardInput & { stage: PlanCardStage } = {
    title: patch.title ?? existing.title,
    stage: patch.stage ?? existing.stage,
    targetDate: "targetDate" in patch ? patch.targetDate ?? null : existing.targetDate,
    estimatedCost: "estimatedCost" in patch ? patch.estimatedCost ?? null : existing.estimatedCost,
    urgent: patch.urgent ?? existing.urgent,
  };
  const updatedAt = new Date().toISOString();

  await db
    .prepare(
      `UPDATE plan_cards
       SET title = ?, stage = ?, target_date = ?, estimated_cost = ?, urgent = ?, updated_at = ?
       WHERE id = ? AND tenant_id = ?`,
    )
    .bind(
      merged.title,
      merged.stage,
      merged.targetDate,
      merged.estimatedCost,
      merged.urgent ? 1 : 0,
      updatedAt,
      id,
      ctx.tenantId,
    )
    .run();

  if (existing.stage !== "done" && merged.stage === "done") {
    const odometerReading = await getVehicleCurrentOdometer(db, ctx, existing.vehicleId);
    await createServiceRecord(db, ctx, existing.vehicleId, {
      serviceDate: todayDateOnly(),
      description: merged.title,
      odometerReading,
      cost: merged.estimatedCost,
      notes: "Created from the maintenance planner",
      performedBy: null,
    });
  }

  return { ...existing, ...merged, updatedAt };
}

export async function deletePlanCard(
  db: D1Database,
  ctx: TenantContext,
  id: string,
): Promise<boolean> {
  const { meta } = await db.prepare("DELETE FROM plan_cards WHERE id = ? AND tenant_id = ?")
    .bind(id, ctx.tenantId)
    .run();
  return meta.changes > 0;
}

// --- Vehicle aggregates -----------------------------------------------------

export type VehicleAggregates = {
  costPerDistance: number | null;
  costPerTime: number | null;
  averageFuelEconomy: number | null;
  currentOdometer: number | null;
};

/**
 * Every sum/min/max/mean below folds over service + fuel records with duplicateOfId === null
 * only (D-005) — a flagged record must not double-count its cost or skew the distance/date span.
 * Assumes the caller (the route) has already confirmed the vehicle exists and belongs to
 * ctx.tenantId via findVehicleById, same trust contract createServiceRecord's doc comment
 * establishes for vehicle-scoped writes.
 *
 * Computed fresh on every call — nothing here is stored, so a record just added, edited, or
 * deleted is always reflected on the very next call (FR-009, research.md).
 */
export async function computeVehicleAggregates(
  db: D1Database,
  ctx: TenantContext,
  vehicleId: string,
  displayUnit?: "km" | "mi",
): Promise<VehicleAggregates> {
  const [serviceRecords, fuelRecords] = await Promise.all([
    listServiceRecords(db, ctx, vehicleId),
    listFuelRecordsWithEconomy(db, ctx, vehicleId, displayUnit),
  ]);
  const services = serviceRecords.filter((r) => r.duplicateOfId === null);
  const fuels = fuelRecords.filter((r) => r.duplicateOfId === null);

  let totalCost = 0;
  const odometerPoints: number[] = [];
  const datePoints: string[] = [];
  for (const record of services) {
    if (record.cost !== null) totalCost += record.cost;
    if (record.odometerReading !== null) odometerPoints.push(record.odometerReading);
    datePoints.push(record.serviceDate);
  }
  for (const record of fuels) {
    totalCost += record.cost;
    odometerPoints.push(record.odometerReading);
    datePoints.push(record.fuelDate);
  }

  const currentOdometer = odometerPoints.length > 0 ? Math.max(...odometerPoints) : null;

  const distanceSpan = odometerPoints.length >= 2
    ? Math.max(...odometerPoints) - Math.min(...odometerPoints)
    : 0;
  const costPerDistance = distanceSpan > 0 ? totalCost / distanceSpan : null;

  const daySpan = datePoints.length >= 2
    ? (Date.parse(datePoints.reduce((a, b) => (a > b ? a : b))) -
      Date.parse(datePoints.reduce((a, b) => (a < b ? a : b)))) / 86_400_000
    : 0;
  const costPerTime = daySpan > 0 ? totalCost / daySpan : null;

  const economies = fuels
    .map((r) => r.fuelEconomy)
    .filter((economy): economy is number => economy !== null);
  const averageFuelEconomy = economies.length > 0
    ? economies.reduce((sum, value) => sum + value, 0) / economies.length
    : null;

  return { costPerDistance, costPerTime, averageFuelEconomy, currentOdometer };
}

export type ExpenseGroupBy = "month" | "year";

export type ExpensePeriod = {
  period: string;
  maintenanceCost: number;
  fuelCost: number;
  totalCost: number;
};

/**
 * A second, derived view over the exact same records computeVehicleAggregates reads (specs/026)
 * — same D-005 duplicate exclusion, same trust contract (caller has already resolved vehicleId
 * belongs to ctx.tenantId via findVehicleById). Period keys are string-sliced directly from the
 * stored date-only strings (research.md) — no Date parsing, and the slice sorts chronologically
 * for free. Only periods with at least one qualifying record are included (FR-004); a missing
 * service-record cost contributes 0, never fabricated or skipped (FR-005).
 */
export async function computeVehicleExpenseBreakdown(
  db: D1Database,
  ctx: TenantContext,
  vehicleId: string,
  groupBy: ExpenseGroupBy,
): Promise<ExpensePeriod[]> {
  const [serviceRecords, fuelRecords] = await Promise.all([
    listServiceRecords(db, ctx, vehicleId),
    listFuelRecordsWithEconomy(db, ctx, vehicleId),
  ]);
  const services = serviceRecords.filter((r) => r.duplicateOfId === null);
  const fuels = fuelRecords.filter((r) => r.duplicateOfId === null);

  const sliceLength = groupBy === "month" ? 7 : 4;
  const byPeriod = new Map<string, ExpensePeriod>();

  function bucket(period: string): ExpensePeriod {
    let entry = byPeriod.get(period);
    if (!entry) {
      entry = { period, maintenanceCost: 0, fuelCost: 0, totalCost: 0 };
      byPeriod.set(period, entry);
    }
    return entry;
  }

  for (const record of services) {
    const entry = bucket(record.serviceDate.slice(0, sliceLength));
    const cost = record.cost ?? 0;
    entry.maintenanceCost += cost;
    entry.totalCost += cost;
  }
  for (const record of fuels) {
    const entry = bucket(record.fuelDate.slice(0, sliceLength));
    entry.fuelCost += record.cost;
    entry.totalCost += record.cost;
  }

  return [...byPeriod.values()].sort((a, b) => a.period.localeCompare(b.period));
}

/**
 * The same filtered, non-duplicate service+fuel records computeVehicleExpenseBreakdown reads —
 * returned unaggregated (specs/027) rather than folded into period sums, for the PDF report to
 * format directly. Third occurrence of this exact fetch+filter shape (after
 * computeVehicleAggregates and computeVehicleExpenseBreakdown), now worth naming once
 * (research.md).
 */
export async function getVehicleHistoryForReport(
  db: D1Database,
  ctx: TenantContext,
  vehicleId: string,
): Promise<{ services: ServiceRecord[]; fuels: FuelRecordWithEconomy[] }> {
  const [serviceRecords, fuelRecords] = await Promise.all([
    listServiceRecords(db, ctx, vehicleId),
    listFuelRecordsWithEconomy(db, ctx, vehicleId),
  ]);
  return {
    services: serviceRecords.filter((r) => r.duplicateOfId === null),
    fuels: fuelRecords.filter((r) => r.duplicateOfId === null),
  };
}

// --- Reminder rules --------------------------------------------------------

export type ReminderStatus = "on_track" | "coming_up" | "overdue" | "not_enough_data";

export type ReminderRule = {
  id: string;
  tenantId: string;
  vehicleId: string;
  label: string;
  intervalDays: number | null;
  intervalDistance: number | null;
  lastDoneDate: string | null;
  lastDoneOdometer: number | null;
  cachedStatus: ReminderStatus | null;
  lastEvaluatedAt: string | null;
  lastNotifiedSeverity: "coming_up" | "overdue" | null;
  createdAt: string;
  updatedAt: string;
};

export type ReminderRuleInput = {
  label: string;
  intervalDays: number | null;
  intervalDistance: number | null;
  lastDoneDate: string | null;
  lastDoneOdometer: number | null;
};

export type ReminderStatusResult = {
  status: ReminderStatus;
  byDate: ReminderStatus | null;
  byMileage: ReminderStatus | null;
  dueDate: string | null;
  dueOdometer: number | null;
  /** The remaining-interval fraction (specs/041) belonging to whichever side determined `status` —
   * same selection as `status` itself. Negative once overdue. `null` iff `status ===
   * "not_enough_data"`. Never a new computation: this is the exact value
   * `classifyRemainingFraction` already classified, just no longer discarded. */
  remainingFraction: number | null;
  /** The absolute remaining days/distance (specs/043) belonging to the same winning side as
   * `remainingFraction` — negative once overdue, `null` iff `status === "not_enough_data"`. Server
   * returns only the number + unit tag, never a formatted sentence (constitution Principle IX). */
  remainingValue: number | null;
  remainingUnit: "days" | "distance" | null;
};

export type ReminderRuleWithStatus = ReminderRule & ReminderStatusResult;

const REMINDER_RULE_COLUMNS =
  "id, tenant_id AS tenantId, vehicle_id AS vehicleId, label, interval_days AS intervalDays, interval_distance AS intervalDistance, last_done_date AS lastDoneDate, last_done_odometer AS lastDoneOdometer, cached_status AS cachedStatus, last_evaluated_at AS lastEvaluatedAt, last_notified_severity AS lastNotifiedSeverity, created_at AS createdAt, updated_at AS updatedAt";

const REMINDER_COMING_UP_THRESHOLD = 0.1; // last 10% of the interval remaining (research.md)

const REMINDER_URGENCY: Record<"on_track" | "coming_up" | "overdue", number> = {
  on_track: 0,
  coming_up: 1,
  overdue: 2,
};

function classifyRemainingFraction(
  remainingFraction: number,
): "on_track" | "coming_up" | "overdue" {
  if (remainingFraction < 0) return "overdue";
  if (remainingFraction <= REMINDER_COMING_UP_THRESHOLD) return "coming_up";
  return "on_track";
}

/**
 * Pure function, no D1 access (data-model.md) — the four-state logic (research.md's
 * proportional-remaining threshold) is directly unit-testable. `currentOdometer` is null when the
 * vehicle has no fuel/service records yet; a mileage side with no odometer data always reports
 * "not_enough_data", never a guessed status (constitution Principle IV).
 */
export function computeReminderStatus(
  rule: ReminderRule,
  currentOdometer: number | null,
  now: Date,
): ReminderStatusResult {
  let byDate: ReminderStatus | null = null;
  let dueDate: string | null = null;
  let fractionByDate: number | null = null;
  let remainingDaysValue: number | null = null;
  if (rule.intervalDays !== null && rule.lastDoneDate !== null) {
    const lastDoneMs = Date.parse(rule.lastDoneDate);
    const dueMs = lastDoneMs + rule.intervalDays * 86_400_000;
    dueDate = new Date(dueMs).toISOString().slice(0, 10);
    const remainingDays = (dueMs - now.getTime()) / 86_400_000;
    remainingDaysValue = remainingDays;
    fractionByDate = remainingDays / rule.intervalDays;
    byDate = classifyRemainingFraction(fractionByDate);
  }

  let byMileage: ReminderStatus | null = null;
  let dueOdometer: number | null = null;
  let fractionByMileage: number | null = null;
  let remainingDistanceValue: number | null = null;
  if (rule.intervalDistance !== null) {
    if (rule.lastDoneOdometer !== null && currentOdometer !== null) {
      dueOdometer = rule.lastDoneOdometer + rule.intervalDistance;
      const remainingDistance = dueOdometer - currentOdometer;
      remainingDistanceValue = remainingDistance;
      fractionByMileage = remainingDistance / rule.intervalDistance;
      byMileage = classifyRemainingFraction(fractionByMileage);
    } else {
      byMileage = "not_enough_data";
    }
  }

  let status: ReminderStatus;
  let remainingFraction: number | null;
  let remainingValue: number | null;
  let remainingUnit: "days" | "distance" | null;
  if (byDate !== null && byMileage !== null && byMileage !== "not_enough_data") {
    // Both sides computable — the more urgent one wins ("whichever comes first", FR-006).
    const dateWins = REMINDER_URGENCY[byDate as "on_track" | "coming_up" | "overdue"] >=
      REMINDER_URGENCY[byMileage as "on_track" | "coming_up" | "overdue"];
    status = dateWins ? byDate : byMileage;
    remainingFraction = dateWins ? fractionByDate : fractionByMileage;
    remainingValue = dateWins ? remainingDaysValue : remainingDistanceValue;
    remainingUnit = dateWins ? "days" : "distance";
  } else if (byDate !== null) {
    // Either mileage-side data is missing (ignored per FR-007) or there's no mileage interval.
    status = byDate;
    remainingFraction = fractionByDate;
    remainingValue = remainingDaysValue;
    remainingUnit = "days";
  } else {
    status = byMileage ?? "not_enough_data";
    remainingFraction = fractionByMileage;
    remainingValue = remainingDistanceValue;
    remainingUnit = remainingDistanceValue !== null ? "distance" : null;
  }

  return {
    status,
    byDate,
    byMileage,
    dueDate,
    dueOdometer,
    remainingFraction,
    remainingValue,
    remainingUnit,
  };
}

/**
 * The MAX()-over-UNION query from research.md — a vehicle's current known odometer reading is the
 * highest reading among all of its fuel and service records combined (service records'
 * odometer_reading is nullable; only non-null rows count). Null if neither table has a row yet.
 * Not tenant-context-scoped at this level so the scheduled sweep (which has no TenantContext) can
 * reuse it directly; `getVehicleCurrentOdometer` below is the normal tenant-scoped entry point.
 */
async function currentOdometerQuery(
  db: D1Database,
  tenantId: string,
  vehicleId: string,
): Promise<number | null> {
  const row = await db
    .prepare(
      `SELECT MAX(odometer_reading) AS maxOdometer FROM (
         SELECT odometer_reading FROM fuel_records WHERE vehicle_id = ? AND tenant_id = ?
         UNION ALL
         SELECT odometer_reading FROM service_records
         WHERE vehicle_id = ? AND tenant_id = ? AND odometer_reading IS NOT NULL
       )`,
    )
    .bind(vehicleId, tenantId, vehicleId, tenantId)
    .first<{ maxOdometer: number | null }>();
  return row?.maxOdometer ?? null;
}

export function getVehicleCurrentOdometer(
  db: D1Database,
  ctx: TenantContext,
  vehicleId: string,
): Promise<number | null> {
  return currentOdometerQuery(db, ctx.tenantId, vehicleId);
}

export async function createReminderRule(
  db: D1Database,
  ctx: TenantContext,
  vehicleId: string,
  input: ReminderRuleInput,
  clientId?: string,
): Promise<ReminderRule> {
  const id = clientId ?? crypto.randomUUID();
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO reminder_rules
       (id, tenant_id, vehicle_id, label, interval_days, interval_distance, last_done_date, last_done_odometer, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      ctx.tenantId,
      vehicleId,
      input.label,
      input.intervalDays,
      input.intervalDistance,
      input.lastDoneDate,
      input.lastDoneOdometer,
      now,
      now,
    )
    .run();
  return {
    id,
    tenantId: ctx.tenantId,
    vehicleId,
    label: input.label,
    intervalDays: input.intervalDays,
    intervalDistance: input.intervalDistance,
    lastDoneDate: input.lastDoneDate,
    lastDoneOdometer: input.lastDoneOdometer,
    cachedStatus: null,
    lastEvaluatedAt: null,
    lastNotifiedSeverity: null,
    createdAt: now,
    updatedAt: now,
  };
}

export type ServiceDueEstimate = {
  description: string;
  estimatedOdometer: number;
  averageInterval: number;
  basedOnRecordCount: number;
} | null;

type ServiceDueEstimateCandidate = {
  description: string;
  estimatedOdometer: number;
  averageInterval: number;
  basedOnRecordCount: number;
  lastDoneDate: string;
  lastDoneOdometer: number;
};

function normalizeServiceDescription(description: string): string {
  return description.trim().toLowerCase();
}

/**
 * Shared core for computeServiceDueEstimate (GET) and acceptServiceDueEstimate (POST) — the accept
 * path re-derives this itself rather than trusting a client-supplied estimatedOdometer/
 * averageInterval (data-model.md), and needs the winning group's lastDoneDate/lastDoneOdometer that
 * the public ServiceDueEstimate shape doesn't expose.
 */
async function findServiceDueEstimateCandidate(
  db: D1Database,
  ctx: TenantContext,
  vehicleId: string,
): Promise<ServiceDueEstimateCandidate | null> {
  const records = await listServiceRecords(db, ctx, vehicleId);
  const usable = records.filter((r) => r.duplicateOfId === null && r.odometerReading !== null);

  const groups = new Map<string, ServiceRecord[]>();
  for (const record of usable) {
    const key = normalizeServiceDescription(record.description);
    const group = groups.get(key);
    if (group) group.push(record);
    else groups.set(key, [record]);
  }

  const { results: ruleRows } = await db
    .prepare(`SELECT label FROM reminder_rules WHERE vehicle_id = ? AND tenant_id = ?`)
    .bind(vehicleId, ctx.tenantId)
    .all<{ label: string }>();
  const existingLabels = new Set(ruleRows.map((r) => normalizeServiceDescription(r.label)));

  const candidates: ServiceDueEstimateCandidate[] = [];
  for (const [key, group] of groups) {
    if (group.length < 2 || existingLabels.has(key)) continue;

    const sorted = [...group].sort((a, b) => a.serviceDate.localeCompare(b.serviceDate));
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      // Indices 1..sorted.length-1 are always in-bounds here (group.length >= 2 checked above);
      // odometerReading is non-null for every record (filtered above).
      const current = sorted[i]!;
      const prior = sorted[i - 1]!;
      const distance = current.odometerReading! - prior.odometerReading!;
      if (distance > 0) intervals.push(distance); // zero-distance pairs contribute no usable interval
    }
    if (intervals.length === 0) continue;

    const averageInterval = intervals.reduce((sum, v) => sum + v, 0) / intervals.length;
    const mostRecent = sorted[sorted.length - 1]!; // sorted.length >= 2, so this index always exists
    candidates.push({
      description: mostRecent.description,
      estimatedOdometer: mostRecent.odometerReading! + averageInterval,
      averageInterval,
      basedOnRecordCount: sorted.length,
      lastDoneDate: mostRecent.serviceDate,
      lastDoneOdometer: mostRecent.odometerReading!,
    });
  }
  if (candidates.length === 0) return null;

  // Soonest-due wins; ties broken by most-recent contributing record's serviceDate (spec Edge Cases).
  candidates.sort((a, b) =>
    a.estimatedOdometer - b.estimatedOdometer || b.lastDoneDate.localeCompare(a.lastDoneDate)
  );
  return candidates[0]!; // candidates.length checked above
}

/**
 * Server-computed live estimate for the service-entry form (specs/053, constitution Principle II —
 * this must never move client-side). Groups a vehicle's own service history by normalized
 * description and, for the single soonest-due qualifying group, projects a next-due odometer
 * reading from the average interval between its records. Never persists anything.
 */
export async function computeServiceDueEstimate(
  db: D1Database,
  ctx: TenantContext,
  vehicleId: string,
): Promise<ServiceDueEstimate> {
  const candidate = await findServiceDueEstimateCandidate(db, ctx, vehicleId);
  if (!candidate) return null;
  const { description, estimatedOdometer, averageInterval, basedOnRecordCount } = candidate;
  return { description, estimatedOdometer, averageInterval, basedOnRecordCount };
}

/**
 * Turns a shown estimate into a real reminder_rules row (specs/053 FR-008/FR-009) — re-derives the
 * estimate from current data rather than trusting the client's remembered numbers, so a stale
 * client can't write a stale/fabricated interval. Returns null when no group still qualifies for
 * `description` (already accepted, superseded by new records, or never existed) — the route maps
 * that to 409 per contracts/api.md. Field mapping (data-model.md): distance-only, so intervalDays
 * stays null.
 */
export async function acceptServiceDueEstimate(
  db: D1Database,
  ctx: TenantContext,
  vehicleId: string,
  description: string,
  clientId?: string,
): Promise<ReminderRule | null> {
  const candidate = await findServiceDueEstimateCandidate(db, ctx, vehicleId);
  if (
    !candidate ||
    normalizeServiceDescription(candidate.description) !== normalizeServiceDescription(description)
  ) {
    return null;
  }
  return createReminderRule(
    db,
    ctx,
    vehicleId,
    {
      label: candidate.description,
      intervalDays: null,
      intervalDistance: candidate.averageInterval,
      lastDoneDate: candidate.lastDoneDate,
      lastDoneOdometer: candidate.lastDoneOdometer,
    },
    clientId,
  );
}

/**
 * Fetches the vehicle's rules and its current odometer reading once, then maps
 * computeReminderStatus over each rule — avoids an N+1 odometer lookup per rule.
 */
export async function listReminderRulesWithStatus(
  db: D1Database,
  ctx: TenantContext,
  vehicleId: string,
): Promise<ReminderRuleWithStatus[]> {
  const { results } = await db
    .prepare(
      `SELECT ${REMINDER_RULE_COLUMNS} FROM reminder_rules
       WHERE vehicle_id = ? AND tenant_id = ? ORDER BY created_at`,
    )
    .bind(vehicleId, ctx.tenantId)
    .all<ReminderRule>();

  const currentOdometer = await currentOdometerQuery(db, ctx.tenantId, vehicleId);
  const now = new Date();
  return results.map((rule) => ({ ...rule, ...computeReminderStatus(rule, currentOdometer, now) }));
}

/**
 * Same not-found-or-not-yours contract as findFuelRecordById (FR-003).
 */
export async function findReminderRuleById(
  db: D1Database,
  ctx: TenantContext,
  id: string,
): Promise<ReminderRuleWithStatus | null> {
  const row = await db
    .prepare(`SELECT ${REMINDER_RULE_COLUMNS} FROM reminder_rules WHERE id = ? AND tenant_id = ?`)
    .bind(id, ctx.tenantId)
    .first<ReminderRule>();
  if (!row) return null;

  const currentOdometer = await currentOdometerQuery(db, ctx.tenantId, row.vehicleId);
  return { ...row, ...computeReminderStatus(row, currentOdometer, new Date()) };
}

/**
 * Resets last_done_date to today, and (only if the rule has a mileage interval)
 * last_done_odometer to the vehicle's current known odometer reading — an odometer-only rule
 * doesn't get a date reset and vice versa (spec.md Edge Cases). Same not-found-or-not-yours
 * contract as findReminderRuleById.
 */
/**
 * Also logs a real service record documenting the work (specs/049), mirroring updatePlanCard's own
 * done-transition side effect exactly — never a fabricated cost/performer (constitution Principle
 * IV), and safe under retry because the /mark-done route's existing `idempotent` middleware already
 * short-circuits a replayed request before this function ever runs a second time (Principle III).
 */
export async function markReminderRuleDone(
  db: D1Database,
  ctx: TenantContext,
  id: string,
): Promise<ReminderRuleWithStatus | null> {
  const existing = await db
    .prepare(`SELECT ${REMINDER_RULE_COLUMNS} FROM reminder_rules WHERE id = ? AND tenant_id = ?`)
    .bind(id, ctx.tenantId)
    .first<ReminderRule>();
  if (!existing) return null;

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const lastDoneDate = existing.intervalDays !== null ? today : existing.lastDoneDate;
  const currentOdometer = await currentOdometerQuery(db, ctx.tenantId, existing.vehicleId);
  const lastDoneOdometer = existing.intervalDistance !== null
    ? currentOdometer
    : existing.lastDoneOdometer;

  await db
    .prepare(
      `UPDATE reminder_rules SET last_done_date = ?, last_done_odometer = ?, updated_at = ?
       WHERE id = ? AND tenant_id = ?`,
    )
    .bind(lastDoneDate, lastDoneOdometer, now.toISOString(), id, ctx.tenantId)
    .run();

  await createServiceRecord(db, ctx, existing.vehicleId, {
    serviceDate: todayDateOnly(),
    description: existing.label,
    odometerReading: currentOdometer,
    cost: null,
    notes: "Created from marking a reminder done — fill in the real details.",
    performedBy: null,
  });

  return findReminderRuleById(db, ctx, id);
}

/**
 * Applies only the fields present in `patch` — everything else keeps its stored value, same
 * pattern updateFuelRecord established. The route layer is responsible for rejecting a patch that
 * would leave the rule with neither interval (tasks.md T011) before calling this.
 */
export async function updateReminderRule(
  db: D1Database,
  ctx: TenantContext,
  id: string,
  patch: Partial<ReminderRuleInput>,
): Promise<ReminderRuleWithStatus | null> {
  const existing = await db
    .prepare(`SELECT ${REMINDER_RULE_COLUMNS} FROM reminder_rules WHERE id = ? AND tenant_id = ?`)
    .bind(id, ctx.tenantId)
    .first<ReminderRule>();
  if (!existing) return null;

  const merged: ReminderRuleInput = {
    label: patch.label ?? existing.label,
    intervalDays: "intervalDays" in patch ? patch.intervalDays ?? null : existing.intervalDays,
    intervalDistance: "intervalDistance" in patch
      ? patch.intervalDistance ?? null
      : existing.intervalDistance,
    lastDoneDate: "lastDoneDate" in patch ? patch.lastDoneDate ?? null : existing.lastDoneDate,
    lastDoneOdometer: "lastDoneOdometer" in patch
      ? patch.lastDoneOdometer ?? null
      : existing.lastDoneOdometer,
  };
  const updatedAt = new Date().toISOString();

  await db
    .prepare(
      `UPDATE reminder_rules
       SET label = ?, interval_days = ?, interval_distance = ?, last_done_date = ?, last_done_odometer = ?, updated_at = ?
       WHERE id = ? AND tenant_id = ?`,
    )
    .bind(
      merged.label,
      merged.intervalDays,
      merged.intervalDistance,
      merged.lastDoneDate,
      merged.lastDoneOdometer,
      updatedAt,
      id,
      ctx.tenantId,
    )
    .run();

  return findReminderRuleById(db, ctx, id);
}

export async function deleteReminderRule(
  db: D1Database,
  ctx: TenantContext,
  id: string,
): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM reminder_rules WHERE id = ? AND tenant_id = ?")
    .bind(id, ctx.tenantId)
    .run();
  return result.meta.changes > 0;
}

/**
 * Matches the placeholder domain src/server/routes/v1/auth/passkey.ts generates when a passkey
 * registration supplies no email (`${uuid}@example.invalid`) — a syntactically valid but
 * non-deliverable address (spec 012 research.md Decision 3).
 */
export function isPlaceholderEmail(email: string): boolean {
  return email.endsWith("@example.invalid");
}

/**
 * Resolves the email to notify for a tenant, or null if none is deliverable (spec 012 research.md
 * Decision 3): users.email is set once at account bootstrap and never updated afterward, even when
 * a real magic-link identity is later linked to a passkey-only account — so a placeholder
 * users.email doesn't necessarily mean the tenant has no real address, only that the real one (if
 * any) lives in magic_link_identities instead.
 */
export async function findDeliverableReminderRecipient(
  db: D1Database,
  tenantId: string,
): Promise<string | null> {
  const user = await db
    .prepare("SELECT id, email FROM users WHERE tenant_id = ?")
    .bind(tenantId)
    .first<{ id: string; email: string }>();
  if (!user) return null;
  if (!isPlaceholderEmail(user.email)) return user.email;

  const linked = await db
    .prepare("SELECT email FROM magic_link_identities WHERE user_id = ?")
    .bind(user.id)
    .first<{ email: string }>();
  return linked?.email ?? null;
}

// --- Push subscriptions (spec 022: web push reminder delivery) ---

export type PushSubscription = {
  id: string;
  tenantId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: string;
};

const PUSH_SUBSCRIPTION_COLUMNS =
  "id, tenant_id AS tenantId, endpoint, p256dh, auth, created_at AS createdAt";

export async function listPushSubscriptions(
  db: D1Database,
  tenantId: string,
): Promise<PushSubscription[]> {
  const { results } = await db
    .prepare(`SELECT ${PUSH_SUBSCRIPTION_COLUMNS} FROM push_subscriptions WHERE tenant_id = ?`)
    .bind(tenantId)
    .all<PushSubscription>();
  return results;
}

export async function createOrUpdatePushSubscription(
  db: D1Database,
  ctx: TenantContext,
  input: { endpoint: string; p256dh: string; auth: string },
): Promise<PushSubscription> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO push_subscriptions (id, tenant_id, endpoint, p256dh, auth)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (tenant_id, endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`,
    )
    .bind(id, ctx.tenantId, input.endpoint, input.p256dh, input.auth)
    .run();
  const stored = await db
    .prepare(
      `SELECT ${PUSH_SUBSCRIPTION_COLUMNS} FROM push_subscriptions
       WHERE tenant_id = ? AND endpoint = ?`,
    )
    .bind(ctx.tenantId, input.endpoint)
    .first<PushSubscription>();
  if (!stored) throw new Error("push subscription vanished immediately after upsert");
  return stored;
}

/** Idempotent — deleting an already-absent subscription is not an error (FR-006). */
export async function deletePushSubscriptionByEndpoint(
  db: D1Database,
  ctx: TenantContext,
  endpoint: string,
): Promise<void> {
  await db
    .prepare("DELETE FROM push_subscriptions WHERE tenant_id = ? AND endpoint = ?")
    .bind(ctx.tenantId, endpoint)
    .run();
}

/** Used by the sweep to prune a subscription the push service reports as gone (research.md). */
export async function deletePushSubscriptionById(db: D1Database, id: string): Promise<void> {
  await db.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(id).run();
}

/**
 * The Cron-triggered sweep (research.md decision 3) — deliberately takes no TenantContext,
 * unlike every other function in this file, since it must evaluate every tenant's rules in one
 * run (data-model.md's documented cross-tenant exception). Persists cached_status/last_evaluated_at
 * per row; a single row's failure is isolated so the rest of the sweep still completes (FR-011).
 *
 * Also drives spec 012's email side effect and spec 022's push side effect: on_track clears
 * last_notified_severity; a coming_up/overdue status more severe than what was already notified
 * triggers one attempt per channel (email to the deliverable recipient, if any; push to every
 * subscription, if any), advancing last_notified_severity if *either* channel succeeds (spec 022
 * research.md — a shared gate, not per-channel) — never on a total skip (nothing deliverable on
 * either channel) or an outright failure, so both retry naturally on the next sweep.
 */
export async function evaluateAllReminders(
  env: Env & VapidSecrets,
): Promise<{ evaluated: number; failed: number; notified: number }> {
  const db = env.DB;
  const { results } = await db
    .prepare(`SELECT ${REMINDER_RULE_COLUMNS} FROM reminder_rules`)
    .all<ReminderRule>();

  // VAPID secrets may not be configured yet (e.g. before the one-time setup in
  // specs/022-web-push-reminders/quickstart.md runs, or in a test environment) — push is simply
  // unavailable for this sweep in that case, never a reason to fail email or the sweep itself.
  let vapidKeys: CryptoKeyPair | null = null;
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
    try {
      vapidKeys = await deserializeVapidKeys({
        publicKey: env.VAPID_PUBLIC_KEY,
        privateKey: env.VAPID_PRIVATE_KEY,
      });
    } catch {
      vapidKeys = null;
    }
  }

  const now = new Date();
  let evaluated = 0;
  let failed = 0;
  let notified = 0;

  for (const rule of results) {
    try {
      const currentOdometer = await currentOdometerQuery(db, rule.tenantId, rule.vehicleId);
      const { status } = computeReminderStatus(rule, currentOdometer, now);
      await db
        .prepare(
          "UPDATE reminder_rules SET cached_status = ?, last_evaluated_at = ? WHERE id = ?",
        )
        .bind(status, now.toISOString(), rule.id)
        .run();
      evaluated++;

      if (status === "on_track") {
        if (rule.lastNotifiedSeverity !== null) {
          await db
            .prepare("UPDATE reminder_rules SET last_notified_severity = NULL WHERE id = ?")
            .bind(rule.id)
            .run();
        }
      } else if (status === "coming_up" || status === "overdue") {
        const notifiedSeverity = REMINDER_URGENCY[rule.lastNotifiedSeverity ?? "on_track"];
        if (REMINDER_URGENCY[status] > notifiedSeverity) {
          const vehicle = await db
            .prepare("SELECT name FROM vehicles WHERE id = ?")
            .bind(rule.vehicleId)
            .first<{ name: string }>();
          const vehicleName = vehicle?.name ?? "your vehicle";

          let attempted = false;
          let sent = false;

          const recipient = await findDeliverableReminderRecipient(db, rule.tenantId);
          if (recipient !== null) {
            attempted = true;
            const emailResult = await sendReminderDueEmail(env, {
              to: recipient,
              vehicleName,
              itemLabel: rule.label,
              status,
            });
            if (emailResult.sent) sent = true;
          }

          if (vapidKeys) {
            const subscriptions = await listPushSubscriptions(db, rule.tenantId);
            for (const subscription of subscriptions) {
              attempted = true;
              const pushResult = await sendReminderPushNotification(vapidKeys, subscription, {
                vehicleName,
                itemLabel: rule.label,
                status,
              });
              if (pushResult.sent) {
                sent = true;
              } else if (pushResult.expired) {
                await deletePushSubscriptionById(db, subscription.id);
              }
            }
          }

          if (sent) {
            await db
              .prepare("UPDATE reminder_rules SET last_notified_severity = ? WHERE id = ?")
              .bind(status, rule.id)
              .run();
            notified++;
          } else if (attempted) {
            failed++;
          }
        }
      }
    } catch {
      failed++;
    }
  }

  return { evaluated, failed, notified };
}

// --- Idempotency ledger (spec 020: offline write queue, constitution Principle III) ---

export type WriteOperationRecord = {
  statusCode: number;
  responseBody: string;
};

/**
 * Scoped by (tenant, method, path, key) — not just (tenant, key) — so a key accidentally reused
 * across two different routes never short-circuits the second, unrelated request with the first
 * request's cached response (found via a test-coverage audit; constitution Principle III requires
 * idempotency to never fail silently, and returning the wrong cached response for a different
 * operation is exactly that: a silent, wrong success).
 */
export async function findWriteOperation(
  db: D1Database,
  ctx: TenantContext,
  method: string,
  path: string,
  idempotencyKey: string,
): Promise<WriteOperationRecord | null> {
  const row = await db
    .prepare(
      `SELECT status_code AS statusCode, response_body AS responseBody
       FROM write_operations
       WHERE tenant_id = ? AND method = ? AND path = ? AND idempotency_key = ?`,
    )
    .bind(ctx.tenantId, method, path, idempotencyKey)
    .first<WriteOperationRecord>();
  return row ?? null;
}

/**
 * `ON CONFLICT DO NOTHING` rather than letting a duplicate insert throw: a genuine race (the same
 * key arriving twice concurrently, both missing the pre-check) should not surface as a 500 to
 * whichever request loses the race — its own handler result is still returned to its caller
 * normally, it just isn't the copy that ends up canonical in the ledger.
 */
export async function recordWriteOperation(
  db: D1Database,
  ctx: TenantContext,
  input: {
    idempotencyKey: string;
    method: string;
    path: string;
    statusCode: number;
    responseBody: string;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO write_operations (tenant_id, idempotency_key, method, path, status_code, response_body)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (tenant_id, method, path, idempotency_key) DO NOTHING`,
    )
    .bind(
      ctx.tenantId,
      input.idempotencyKey,
      input.method,
      input.path,
      input.statusCode,
      input.responseBody,
    )
    .run();
}

// --- Search (specs/028: tenant-wide search across vehicles and records) ----

const LIKE_ESCAPE_CHAR = "\\";

/**
 * PURE — no D1 access, directly unit-testable (specs/028 research.md). Escapes `\`, `%`, `_` (in
 * that order, so an already-escaped backslash is never double-escaped) so a literal percent sign
 * or underscore in a user's search term is matched literally rather than acting as a SQL LIKE
 * wildcard.
 */
export function escapeLikePattern(query: string): string {
  return query
    .replaceAll(LIKE_ESCAPE_CHAR, LIKE_ESCAPE_CHAR + LIKE_ESCAPE_CHAR)
    .replaceAll("%", LIKE_ESCAPE_CHAR + "%")
    .replaceAll("_", LIKE_ESCAPE_CHAR + "_");
}

export type VehicleMatch = {
  id: string;
  name: string;
  make: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
};

export type RecordMatch = {
  id: string;
  vehicleId: string;
  vehicleName: string;
  date: string | null;
  title: string;
  notes: string | null;
};

export type SearchResults = {
  vehicles: VehicleMatch[];
  serviceRecords: RecordMatch[];
  fuelRecords: RecordMatch[];
  documents: RecordMatch[];
};

/**
 * Tenant-wide — unlike every other function in this file, there is no vehicle id to resolve
 * ownership through first, so each of the four queries scopes itself directly by
 * `ctx.tenantId` (specs/028 FR-009). Deliberately does NOT filter on `duplicateOfId` — a
 * duplicate-flagged record is still real, findable data (FR-007, research.md), unlike the cost
 * aggregates' exclusion rule.
 */
export async function searchTenantData(
  db: D1Database,
  ctx: TenantContext,
  query: string,
): Promise<SearchResults> {
  const pattern = `%${escapeLikePattern(query)}%`;

  const [vehicleRows, serviceRows, fuelRows, documentRows] = await Promise.all([
    db
      .prepare(
        `SELECT id, name, make, model, year, vin FROM vehicles
         WHERE tenant_id = ?
           AND (name LIKE ? ESCAPE '\\' OR make LIKE ? ESCAPE '\\' OR model LIKE ? ESCAPE '\\' OR vin LIKE ? ESCAPE '\\')`,
      )
      .bind(ctx.tenantId, pattern, pattern, pattern, pattern)
      .all<VehicleMatch>(),
    db
      .prepare(
        `SELECT sr.id AS id, sr.vehicle_id AS vehicleId, v.name AS vehicleName,
                sr.service_date AS date, sr.description AS title, sr.notes AS notes
         FROM service_records sr JOIN vehicles v ON v.id = sr.vehicle_id
         WHERE sr.tenant_id = ?
           AND (sr.description LIKE ? ESCAPE '\\' OR sr.notes LIKE ? ESCAPE '\\')`,
      )
      .bind(ctx.tenantId, pattern, pattern)
      .all<RecordMatch>(),
    db
      .prepare(
        `SELECT fr.id AS id, fr.vehicle_id AS vehicleId, v.name AS vehicleName,
                fr.fuel_date AS date, COALESCE(fr.station, '') AS title, fr.notes AS notes
         FROM fuel_records fr JOIN vehicles v ON v.id = fr.vehicle_id
         WHERE fr.tenant_id = ?
           AND (fr.station LIKE ? ESCAPE '\\' OR fr.notes LIKE ? ESCAPE '\\')`,
      )
      .bind(ctx.tenantId, pattern, pattern)
      .all<RecordMatch>(),
    db
      .prepare(
        `SELECT d.id AS id, d.vehicle_id AS vehicleId, v.name AS vehicleName,
                NULL AS date, d.title AS title, d.notes AS notes
         FROM documents d JOIN vehicles v ON v.id = d.vehicle_id
         WHERE d.tenant_id = ?
           AND (d.title LIKE ? ESCAPE '\\' OR d.notes LIKE ? ESCAPE '\\')`,
      )
      .bind(ctx.tenantId, pattern, pattern)
      .all<RecordMatch>(),
  ]);

  return {
    vehicles: vehicleRows.results,
    serviceRecords: serviceRows.results,
    fuelRecords: fuelRows.results,
    documents: documentRows.results,
  };
}
