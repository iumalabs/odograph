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

-- duplicate_of_id: see specs/010-semantic-duplicate-detection/data-model.md (constitution D-005)
-- — self-referencing, ON DELETE SET NULL so deleting the referenced record never blocks or
-- cascades into deleting the record that flagged it.

CREATE TABLE service_records (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  vehicle_id TEXT NOT NULL REFERENCES vehicles (id) ON DELETE CASCADE,
  service_date TEXT NOT NULL,
  description TEXT NOT NULL,
  odometer_reading INTEGER,
  cost REAL,
  notes TEXT,
  duplicate_of_id TEXT REFERENCES service_records (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_service_records_vehicle_id ON service_records (vehicle_id);
CREATE INDEX idx_service_records_tenant_id ON service_records (tenant_id);
CREATE INDEX idx_service_records_duplicate_of_id ON service_records (duplicate_of_id);

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

-- See specs/009-fuel-record-crud/data-model.md for GDPR erasure decisions (same shape as
-- service_records above) and why fuel_economy is not a column here — it's computed at read time
-- from odometer deltas between a vehicle's fuel records, never stored (constitution Principle II).

-- duplicate_of_id: see specs/010-semantic-duplicate-detection/data-model.md (constitution D-005).

CREATE TABLE fuel_records (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  vehicle_id TEXT NOT NULL REFERENCES vehicles (id) ON DELETE CASCADE,
  fuel_date TEXT NOT NULL,
  odometer_reading INTEGER NOT NULL,
  volume REAL NOT NULL,
  cost REAL NOT NULL,
  station TEXT,
  notes TEXT,
  duplicate_of_id TEXT REFERENCES fuel_records (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_fuel_records_vehicle_id ON fuel_records (vehicle_id);
CREATE INDEX idx_fuel_records_tenant_id ON fuel_records (tenant_id);
CREATE INDEX idx_fuel_records_duplicate_of_id ON fuel_records (duplicate_of_id);

CREATE TABLE fuel_record_attachments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  fuel_record_id TEXT NOT NULL REFERENCES fuel_records (id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_fuel_record_attachments_fuel_record_id
  ON fuel_record_attachments (fuel_record_id);

-- See specs/011-reminder-rules-cron/data-model.md. cached_status/last_evaluated_at are written
-- only by the Cron-triggered sweep (evaluateAllReminders) and never read by this feature's own
-- API responses, which always recompute status fresh (constitution Principle II).

CREATE TABLE reminder_rules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  vehicle_id TEXT NOT NULL REFERENCES vehicles (id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  interval_days INTEGER,
  interval_distance INTEGER,
  last_done_date TEXT,
  last_done_odometer INTEGER,
  cached_status TEXT,
  last_evaluated_at TEXT,
  -- last_notified_severity: see specs/012-email-reminder-delivery/data-model.md. Written only by
  -- the same Cron-triggered sweep's email side effect, never by any request handler.
  last_notified_severity TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (interval_days IS NOT NULL OR interval_distance IS NOT NULL)
);

CREATE INDEX idx_reminder_rules_vehicle_id ON reminder_rules (vehicle_id);
CREATE INDEX idx_reminder_rules_tenant_id ON reminder_rules (tenant_id);

-- See specs/023-vehicle-document-records/data-model.md. is_expired is deliberately not a column —
-- computed at read time from expiry_date (constitution Principle II-style derived value).

-- cached_status/last_evaluated_at/last_notified_severity: see
-- specs/024-document-expiry-reminders/data-model.md. Written only by the Cron-triggered sweep
-- (evaluateAllDocumentReminders) and never read by this feature's own API responses, which always
-- recompute status fresh (constitution Principle II) — same posture reminder_rules' equivalent
-- columns already have.

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  vehicle_id TEXT NOT NULL REFERENCES vehicles (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  expiry_date TEXT,
  notes TEXT,
  cached_status TEXT,
  last_evaluated_at TEXT,
  last_notified_severity TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_documents_vehicle_id ON documents (vehicle_id);
CREATE INDEX idx_documents_tenant_id ON documents (tenant_id);

CREATE TABLE document_attachments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_document_attachments_document_id
  ON document_attachments (document_id);
