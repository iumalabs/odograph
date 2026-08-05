-- Migration number: 0008 	 2026-08-05

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
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_fuel_records_vehicle_id ON fuel_records (vehicle_id);
CREATE INDEX idx_fuel_records_tenant_id ON fuel_records (tenant_id);

CREATE TABLE fuel_record_attachments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  fuel_record_id TEXT NOT NULL REFERENCES fuel_records (id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_fuel_record_attachments_fuel_record_id
  ON fuel_record_attachments (fuel_record_id);
