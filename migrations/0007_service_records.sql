-- Migration number: 0007 	 2026-08-05

CREATE TABLE service_records (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  vehicle_id TEXT NOT NULL REFERENCES vehicles (id) ON DELETE CASCADE,
  service_date TEXT NOT NULL,
  description TEXT NOT NULL,
  odometer_reading INTEGER,
  cost REAL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
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
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_service_record_attachments_service_record_id
  ON service_record_attachments (service_record_id);
