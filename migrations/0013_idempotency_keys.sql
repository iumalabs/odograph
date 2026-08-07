-- Migration number: 0013 	 2026-08-07

CREATE TABLE write_operations (
  tenant_id TEXT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response_body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (tenant_id, idempotency_key)
);
