-- Migration number: 0011 	 2026-08-06

ALTER TABLE reminder_rules ADD COLUMN last_notified_severity TEXT;
