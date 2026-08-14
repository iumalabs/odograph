-- Migration number: 0021 	 2026-08-14

-- One-time data backfill (not a schema change): imports the owner's pre-existing maintenance
-- history for their "Subaru Legacy" vehicle (id c7f261a1-6400-49ad-80ff-4f5c6ce50888, tenant
-- fdf5f064-d3fc-401f-bc8e-18792072a0eb) from a LubeLogger export
-- (lubelogger-db_backup_2025-05-10-20-39-07.zip), migrating the owner off their previous tracker.
-- Depends on migration 0020's new columns. Verified before writing: this vehicle had zero
-- service/fuel/reminder/plan rows in production.
--
-- Every INSERT below is its own `INSERT INTO t (...) SELECT ... WHERE EXISTS (SELECT 1 FROM
-- vehicles WHERE id = '<this vehicle>')` — one row per statement, no UNION (D1 rejects a compound
-- SELECT past a small term count: "too many terms in compound SELECT", hit when this was first
-- written as one multi-row UNION ALL insert per table). This migration runs against every
-- environment (production, preview, local dev, and the isolated per-test-run D1 the test suite
-- creates via applyD1Migrations), and none of those except real production actually has this
-- vehicle row. Without the guard, the INSERTs' foreign keys would fail everywhere except
-- production. With it, the migration is a safe no-op everywhere the vehicle doesn't exist and
-- only writes real rows in production.
--
-- Unit note: LubeLogger's fields are named Mileage/Gallons for historical reasons but the actual
-- values entered were km/liters/KGS (verified via the fuel economy math: 365 km on 38.3 L =
-- 9.5 L/100km, a realistic figure for this vehicle — the mile/gallon reading would be an
-- unrealistic ~9.5 MPG).
--
-- Mapping notes:
-- - LubeLogger has no separate "collision" entity in odograph's schema, so its one
--   collisionrecords row is folded into service_records (description "Левый порог").
-- - Service record beb62aef (2022-12-29 oil change) carries LubeLogger's one non-empty Tags
--   entry ("Idemitsu", the oil brand) appended into its notes — a whole tagging subsystem for
--   this single value would be overkill.
-- - Vehicle make/model/year/license plate/purchase date+price/photo were unset in odograph;
--   filled in from LubeLogger's vehicle record.
-- - 5 of 6 attachment photos in the backup were referenced by a service record; the 6th
--   (08672b76-74fa-4a67-b7db-a9d500328aec.jpg) was orphaned (matched no record in the export,
--   likely belonged to a service record already deleted before the backup was taken) and is not
--   imported.
-- - plan_cards' created_at/updated_at use LubeLogger's own DateCreated/DateModified rather than
--   the insert-time default, since the source data has real timestamps for this one.
-- - All service records are set performed_by='shop' per owner confirmation.
--
-- R2 objects (service-record photos + the vehicle photo) are uploaded separately via
-- `wrangler r2 object put --remote` — this migration only writes the D1 rows that reference them
-- by key; running it alone without that upload step would leave those r2_key/photo_r2_key values
-- pointing at objects that don't exist yet.

UPDATE vehicles
SET
  make = 'Subaru',
  model = 'Legacy 2.5 Limited',
  year = 2016,
  license_plate = '08KG698ANU',
  purchase_date = '2023-10-08',
  purchase_price = 14000,
  photo_r2_key = 'tenants/fdf5f064-d3fc-401f-bc8e-18792072a0eb/vehicles/c7f261a1-6400-49ad-80ff-4f5c6ce50888/photo',
  photo_content_type = 'image/jpeg'
WHERE id = 'c7f261a1-6400-49ad-80ff-4f5c6ce50888';

INSERT INTO service_records
  (id, tenant_id, vehicle_id, service_date, description, odometer_reading, cost, notes, performed_by)
SELECT '1e53a398-9522-4bfd-846f-5268c8c6b124', 'fdf5f064-d3fc-401f-bc8e-18792072a0eb', 'c7f261a1-6400-49ad-80ff-4f5c6ce50888',
  '2025-05-10', 'Замена аккумулятора', 95111, 6000,
  'Замена аккумулятора 60А на 80А после того как машина перестала заводиться после пары дней стоянки.',
  'shop'
WHERE EXISTS (SELECT 1 FROM vehicles WHERE id = 'c7f261a1-6400-49ad-80ff-4f5c6ce50888');

INSERT INTO service_records
  (id, tenant_id, vehicle_id, service_date, description, odometer_reading, cost, notes, performed_by)
SELECT '3eda0182-d690-4dcc-aebc-453217debeb1', 'fdf5f064-d3fc-401f-bc8e-18792072a0eb', 'c7f261a1-6400-49ad-80ff-4f5c6ce50888',
  '2025-05-10', 'Чистка дроссельной заслонки после замены аккумулятора', 95111, 1500,
  'После замены аккумулятора. Нужно чистить раз в полгода',
  'shop'
WHERE EXISTS (SELECT 1 FROM vehicles WHERE id = 'c7f261a1-6400-49ad-80ff-4f5c6ce50888');

INSERT INTO service_records
  (id, tenant_id, vehicle_id, service_date, description, odometer_reading, cost, notes, performed_by)
SELECT 'beb62aef-ea96-4984-9d33-16591c9276ba', 'fdf5f064-d3fc-401f-bc8e-18792072a0eb', 'c7f261a1-6400-49ad-80ff-4f5c6ce50888',
  '2022-12-29', 'Замена масла', 68600, 0,
  'Предыдущий хозяин
с воздушным фильтром и топливным фильтром
Мастер: Низам
Масло: Idemitsu',
  'shop'
WHERE EXISTS (SELECT 1 FROM vehicles WHERE id = 'c7f261a1-6400-49ad-80ff-4f5c6ce50888');

INSERT INTO service_records
  (id, tenant_id, vehicle_id, service_date, description, odometer_reading, cost, notes, performed_by)
SELECT 'ec03c705-afed-426d-b7a8-c1bb17af0722', 'fdf5f064-d3fc-401f-bc8e-18792072a0eb', 'c7f261a1-6400-49ad-80ff-4f5c6ce50888',
  '2023-07-31', 'Замена масла', 78500, 0,
  'Предыдущий хозяин
Мастер: Низам',
  'shop'
WHERE EXISTS (SELECT 1 FROM vehicles WHERE id = 'c7f261a1-6400-49ad-80ff-4f5c6ce50888');

INSERT INTO service_records
  (id, tenant_id, vehicle_id, service_date, description, odometer_reading, cost, notes, performed_by)
SELECT 'd2fe3f17-7a31-4ad0-84ba-2d66371f4448', 'fdf5f064-d3fc-401f-bc8e-18792072a0eb', 'c7f261a1-6400-49ad-80ff-4f5c6ce50888',
  '2023-12-20', 'Замена масла', 83500, 0,
  'Предыдущий хозяин
Мастер: Низам',
  'shop'
WHERE EXISTS (SELECT 1 FROM vehicles WHERE id = 'c7f261a1-6400-49ad-80ff-4f5c6ce50888');

INSERT INTO service_records
  (id, tenant_id, vehicle_id, service_date, description, odometer_reading, cost, notes, performed_by)
SELECT '28ac94ba-58a6-4648-9959-1914906aee72', 'fdf5f064-d3fc-401f-bc8e-18792072a0eb', 'c7f261a1-6400-49ad-80ff-4f5c6ce50888',
  '2024-04-13', 'Замена масла', 86668, 0,
  'с фильтром',
  'shop'
WHERE EXISTS (SELECT 1 FROM vehicles WHERE id = 'c7f261a1-6400-49ad-80ff-4f5c6ce50888');

INSERT INTO service_records
  (id, tenant_id, vehicle_id, service_date, description, odometer_reading, cost, notes, performed_by)
SELECT '1ba93418-a0f0-4d38-81c8-c1973f74cf06', 'fdf5f064-d3fc-401f-bc8e-18792072a0eb', 'c7f261a1-6400-49ad-80ff-4f5c6ce50888',
  '2024-11-16', 'Замена масла', 91600, 0,
  'С фильтром',
  'shop'
WHERE EXISTS (SELECT 1 FROM vehicles WHERE id = 'c7f261a1-6400-49ad-80ff-4f5c6ce50888');

INSERT INTO service_records
  (id, tenant_id, vehicle_id, service_date, description, odometer_reading, cost, notes, performed_by)
SELECT 'd724a439-b05f-4585-ad1d-302a766aa5a2', 'fdf5f064-d3fc-401f-bc8e-18792072a0eb', 'c7f261a1-6400-49ad-80ff-4f5c6ce50888',
  '2025-03-26', 'Левый порог', NULL, 3000,
  'Почин ил левый порог после того как порвал его о бордюр возле ветклиники. Осталось немного краски. Сокулук',
  'shop'
WHERE EXISTS (SELECT 1 FROM vehicles WHERE id = 'c7f261a1-6400-49ad-80ff-4f5c6ce50888');

INSERT INTO service_record_attachments
  (id, tenant_id, service_record_id, r2_key, content_type, size)
SELECT '1e1ffd30-f3de-4638-a2bd-b6943b64028e', 'fdf5f064-d3fc-401f-bc8e-18792072a0eb', 'beb62aef-ea96-4984-9d33-16591c9276ba',
  'tenants/fdf5f064-d3fc-401f-bc8e-18792072a0eb/service-records/beb62aef-ea96-4984-9d33-16591c9276ba/1e1ffd30-f3de-4638-a2bd-b6943b64028e',
  'image/jpeg', 224095
WHERE EXISTS (SELECT 1 FROM vehicles WHERE id = 'c7f261a1-6400-49ad-80ff-4f5c6ce50888');

INSERT INTO service_record_attachments
  (id, tenant_id, service_record_id, r2_key, content_type, size)
SELECT 'acec2aa8-e026-4d29-b3d9-74c9ad5d500c', 'fdf5f064-d3fc-401f-bc8e-18792072a0eb', 'ec03c705-afed-426d-b7a8-c1bb17af0722',
  'tenants/fdf5f064-d3fc-401f-bc8e-18792072a0eb/service-records/ec03c705-afed-426d-b7a8-c1bb17af0722/acec2aa8-e026-4d29-b3d9-74c9ad5d500c',
  'image/jpeg', 217609
WHERE EXISTS (SELECT 1 FROM vehicles WHERE id = 'c7f261a1-6400-49ad-80ff-4f5c6ce50888');

INSERT INTO service_record_attachments
  (id, tenant_id, service_record_id, r2_key, content_type, size)
SELECT '7deabc4d-5f56-4cc4-91fc-c9cf9ef35ee0', 'fdf5f064-d3fc-401f-bc8e-18792072a0eb', 'd2fe3f17-7a31-4ad0-84ba-2d66371f4448',
  'tenants/fdf5f064-d3fc-401f-bc8e-18792072a0eb/service-records/d2fe3f17-7a31-4ad0-84ba-2d66371f4448/7deabc4d-5f56-4cc4-91fc-c9cf9ef35ee0',
  'image/jpeg', 154686
WHERE EXISTS (SELECT 1 FROM vehicles WHERE id = 'c7f261a1-6400-49ad-80ff-4f5c6ce50888');

INSERT INTO service_record_attachments
  (id, tenant_id, service_record_id, r2_key, content_type, size)
SELECT 'abf14c5d-e1a4-4a1c-8fa2-060a6d8a4f30', 'fdf5f064-d3fc-401f-bc8e-18792072a0eb', '28ac94ba-58a6-4648-9959-1914906aee72',
  'tenants/fdf5f064-d3fc-401f-bc8e-18792072a0eb/service-records/28ac94ba-58a6-4648-9959-1914906aee72/abf14c5d-e1a4-4a1c-8fa2-060a6d8a4f30',
  'image/jpeg', 184264
WHERE EXISTS (SELECT 1 FROM vehicles WHERE id = 'c7f261a1-6400-49ad-80ff-4f5c6ce50888');

INSERT INTO service_record_attachments
  (id, tenant_id, service_record_id, r2_key, content_type, size)
SELECT '0a45c9bf-e50f-48ea-9f07-ba49b668eff6', 'fdf5f064-d3fc-401f-bc8e-18792072a0eb', '1ba93418-a0f0-4d38-81c8-c1973f74cf06',
  'tenants/fdf5f064-d3fc-401f-bc8e-18792072a0eb/service-records/1ba93418-a0f0-4d38-81c8-c1973f74cf06/0a45c9bf-e50f-48ea-9f07-ba49b668eff6',
  'image/jpeg', 170116
WHERE EXISTS (SELECT 1 FROM vehicles WHERE id = 'c7f261a1-6400-49ad-80ff-4f5c6ce50888');

INSERT INTO fuel_records
  (id, tenant_id, vehicle_id, fuel_date, odometer_reading, volume, cost, station)
SELECT '0fc14ff5-3d74-4fb6-b89c-529c521dd3b4', 'fdf5f064-d3fc-401f-bc8e-18792072a0eb', 'c7f261a1-6400-49ad-80ff-4f5c6ce50888',
  '2025-03-26', 94414, 38.23, 2500, 'Bishkek Petroleum'
WHERE EXISTS (SELECT 1 FROM vehicles WHERE id = 'c7f261a1-6400-49ad-80ff-4f5c6ce50888');

INSERT INTO fuel_records
  (id, tenant_id, vehicle_id, fuel_date, odometer_reading, volume, cost, station)
SELECT '9eaf51ca-b0e3-4ebb-8974-e474b7022e0d', 'fdf5f064-d3fc-401f-bc8e-18792072a0eb', 'c7f261a1-6400-49ad-80ff-4f5c6ce50888',
  '2025-04-16', 94779, 38.3, 2500, 'Red Petroleum'
WHERE EXISTS (SELECT 1 FROM vehicles WHERE id = 'c7f261a1-6400-49ad-80ff-4f5c6ce50888');

INSERT INTO fuel_records
  (id, tenant_id, vehicle_id, fuel_date, odometer_reading, volume, cost, station)
SELECT 'f0913892-6671-4813-970a-db199927590b', 'fdf5f064-d3fc-401f-bc8e-18792072a0eb', 'c7f261a1-6400-49ad-80ff-4f5c6ce50888',
  '2025-05-04', 95111, 34.96, 2300, 'Red Petroleum'
WHERE EXISTS (SELECT 1 FROM vehicles WHERE id = 'c7f261a1-6400-49ad-80ff-4f5c6ce50888');

INSERT INTO reminder_rules
  (id, tenant_id, vehicle_id, label, interval_days, interval_distance, last_done_date, last_done_odometer)
SELECT '6bd24f51-8a96-47b5-ad5b-539f61b6a4f0', 'fdf5f064-d3fc-401f-bc8e-18792072a0eb', 'c7f261a1-6400-49ad-80ff-4f5c6ce50888',
  'Замена масла в двигателе', 181, 5000, '2024-11-16', 91600
WHERE EXISTS (SELECT 1 FROM vehicles WHERE id = 'c7f261a1-6400-49ad-80ff-4f5c6ce50888');

INSERT INTO plan_cards
  (id, tenant_id, vehicle_id, title, stage, estimated_cost, urgent, notes, created_at, updated_at)
SELECT 'a1f6e6f1-0f6b-4f9a-9c2e-6a6e2b6c9e11', 'fdf5f064-d3fc-401f-bc8e-18792072a0eb', 'c7f261a1-6400-49ad-80ff-4f5c6ce50888',
  'Заменить правую подушку', 'idea', 5000, 1,
  'Слева была замена, но все равно есть стук, нужно проверить вторую подушку и при необходимости заменить',
  '2025-05-01T18:59:02.000Z', '2025-05-01T19:00:58.775Z'
WHERE EXISTS (SELECT 1 FROM vehicles WHERE id = 'c7f261a1-6400-49ad-80ff-4f5c6ce50888');
