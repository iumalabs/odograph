-- Human-readable reference copy of the current schema shape.
-- NOT the source of truth — migrations/ is. Regenerate this file by hand
-- whenever a migration changes the shape, in the same PR as the migration.
-- See specs/001-tenant-session-foundation/data-model.md for the full
-- rationale (including per-table GDPR erasure decisions) behind each table.

CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  invalidated_at TEXT
);

CREATE TABLE probe_resources (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

-- See specs/002-passkey-authentication/data-model.md for GDPR erasure
-- decisions (webauthn_credentials: delete on account erasure, not
-- anonymise, unlike users).

CREATE TABLE webauthn_credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  public_key BLOB NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE webauthn_challenges (
  challenge TEXT PRIMARY KEY,
  purpose TEXT NOT NULL CHECK (purpose IN ('registration', 'authentication')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
