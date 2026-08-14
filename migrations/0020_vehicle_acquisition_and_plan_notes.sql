-- Migration number: 0020 	 2026-08-14

-- Adds columns needed to losslessly import a LubeLogger export (migration 0021) without dropping
-- data that has nowhere to live in the current schema: a vehicle's license plate/acquisition
-- info/photo, and a plan card's free-text notes. Purely additive — no existing column, index, or
-- constraint changes.
--
-- No client UI reads/writes these yet (out of scope for this data-preservation pass) — the data
-- lands in the database and is reachable via a direct query today; wiring them into the
-- vehicle/plan-card forms is separate, later work if wanted.

ALTER TABLE vehicles ADD COLUMN license_plate TEXT;
ALTER TABLE vehicles ADD COLUMN purchase_date TEXT;
ALTER TABLE vehicles ADD COLUMN purchase_price REAL;
ALTER TABLE vehicles ADD COLUMN photo_r2_key TEXT;
ALTER TABLE vehicles ADD COLUMN photo_content_type TEXT;

ALTER TABLE plan_cards ADD COLUMN notes TEXT;
