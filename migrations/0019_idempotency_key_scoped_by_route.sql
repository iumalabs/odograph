-- Migration number: 0019 	 2026-08-13

-- Widens write_operations' identity from (tenant_id, idempotency_key) to
-- (tenant_id, method, path, idempotency_key) — a test-coverage audit found that the old key let
-- an Idempotency-Key accidentally reused across two different routes silently short-circuit the
-- second, unrelated request with the FIRST request's cached response (constitution Principle III:
-- idempotency must never fail silently). SQLite can't ALTER a PRIMARY KEY in place, so this
-- recreates the table; every existing row is already unique under the old, narrower key, so it's
-- automatically unique under the new, wider one too — a straight copy can never violate it.

CREATE TABLE write_operations_new (
  tenant_id TEXT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response_body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (tenant_id, method, path, idempotency_key)
);

INSERT INTO write_operations_new SELECT * FROM write_operations;

DROP TABLE write_operations;

ALTER TABLE write_operations_new RENAME TO write_operations;
