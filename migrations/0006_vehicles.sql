-- Migration number: 0006 	 2026-08-05

CREATE TABLE vehicles (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  make TEXT,
  model TEXT,
  year INTEGER,
  vin TEXT,
  odometer_unit TEXT NOT NULL CHECK (odometer_unit IN ('km', 'mi')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_vehicles_tenant_id ON vehicles (tenant_id);

DROP TABLE probe_resources;
