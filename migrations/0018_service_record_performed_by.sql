-- Migration number: 0018 	 2026-08-12

ALTER TABLE service_records
  ADD COLUMN performed_by TEXT CHECK (performed_by IN ('self', 'shop') OR performed_by IS NULL);
