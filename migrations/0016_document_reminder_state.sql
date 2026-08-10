-- Migration number: 0016 	 2026-08-10

ALTER TABLE documents ADD COLUMN cached_status TEXT;
ALTER TABLE documents ADD COLUMN last_evaluated_at TEXT;
ALTER TABLE documents ADD COLUMN last_notified_severity TEXT;
