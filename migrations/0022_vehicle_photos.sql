-- Migration number: 0022 	 2026-08-14

-- Per-vehicle photo gallery (design mockup's new "ФОТО"/"Галерея" screen — Кокпит - прототип.dc.html):
-- categorized photos (general/repair/damage/parts), each optionally captioned, dated, tagged with
-- the odometer reading at capture time, and optionally linked back to the service record it
-- documents. r2_key/content_type/size start NULL — the mockup's own add flow creates an empty
-- tile first (category chosen up front), then attaches the actual image to it in a second step;
-- POST .../vehicle-photos/:id/image (route layer) fills these in once the file is uploaded.

CREATE TABLE vehicle_photos (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants (id) ON DELETE CASCADE,
  vehicle_id TEXT NOT NULL REFERENCES vehicles (id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('general', 'repair', 'damage', 'parts')),
  caption TEXT,
  photo_date TEXT,
  odometer_reading INTEGER,
  service_record_id TEXT REFERENCES service_records (id) ON DELETE SET NULL,
  r2_key TEXT,
  content_type TEXT,
  size INTEGER,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_vehicle_photos_vehicle_id ON vehicle_photos (vehicle_id);
CREATE INDEX idx_vehicle_photos_tenant_id ON vehicle_photos (tenant_id);
CREATE INDEX idx_vehicle_photos_service_record_id ON vehicle_photos (service_record_id);
