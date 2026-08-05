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

-- See specs/003-magic-link-authentication/data-model.md for GDPR erasure
-- decisions and the D-004 rationale for keying identity lookups off
-- magic_link_identities rather than users.email.

CREATE TABLE magic_link_identities (
  email TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

-- linking_user_id: see specs/005-account-linking-rules/data-model.md — NULL for a normal sign-in
-- request, set to the initiating user's id for an account-linking attempt.
CREATE TABLE magic_link_tokens (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  linking_user_id TEXT REFERENCES users (id) ON DELETE CASCADE
);

-- See specs/004-google-oidc-authentication/data-model.md for GDPR erasure
-- decisions and the FR-008 rationale for keying oidc_identities by
-- (provider, subject) rather than users.email.

CREATE TABLE oidc_identities (
  provider TEXT NOT NULL,
  subject TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (provider, subject)
);

-- linking_user_id: see specs/005-account-linking-rules/data-model.md — same role as
-- magic_link_tokens.linking_user_id above, for the OIDC flow's pending-attempt record.
CREATE TABLE oidc_states (
  state TEXT PRIMARY KEY,
  code_verifier TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  linking_user_id TEXT REFERENCES users (id) ON DELETE CASCADE
);

-- See specs/006-vehicle-crud/data-model.md for GDPR erasure decisions (Delete, cascading from
-- tenants — vehicles have no independent retention value once their owning tenant is gone).

CREATE TABLE vehicles (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  make TEXT,
  model TEXT,
  year INTEGER,
  vin TEXT,
  odometer_unit TEXT NOT NULL CHECK (odometer_unit IN ('km', 'mi')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- See specs/007-service-record-crud/data-model.md for GDPR erasure decisions (Delete, cascading
-- from vehicles) and why R2 attachment objects are never cleaned up by this cascade — every
-- deletion code path must explicitly delete the matching R2 objects itself.

CREATE TABLE service_records (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  vehicle_id TEXT NOT NULL REFERENCES vehicles (id) ON DELETE CASCADE,
  service_date TEXT NOT NULL,
  description TEXT NOT NULL,
  odometer_reading INTEGER,
  cost REAL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_service_records_vehicle_id ON service_records (vehicle_id);
CREATE INDEX idx_service_records_tenant_id ON service_records (tenant_id);

CREATE TABLE service_record_attachments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  service_record_id TEXT NOT NULL REFERENCES service_records (id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_service_record_attachments_service_record_id
  ON service_record_attachments (service_record_id);
