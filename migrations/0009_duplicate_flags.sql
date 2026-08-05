-- Migration number: 0009 	 2026-08-05

ALTER TABLE fuel_records
  ADD COLUMN duplicate_of_id TEXT REFERENCES fuel_records (id) ON DELETE SET NULL;

CREATE INDEX idx_fuel_records_duplicate_of_id ON fuel_records (duplicate_of_id);

ALTER TABLE service_records
  ADD COLUMN duplicate_of_id TEXT REFERENCES service_records (id) ON DELETE SET NULL;

CREATE INDEX idx_service_records_duplicate_of_id ON service_records (duplicate_of_id);
