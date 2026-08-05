-- Migration number: 0010 	 2026-08-05

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
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (interval_days IS NOT NULL OR interval_distance IS NOT NULL)
);

CREATE INDEX idx_reminder_rules_vehicle_id ON reminder_rules (vehicle_id);
CREATE INDEX idx_reminder_rules_tenant_id ON reminder_rules (tenant_id);
