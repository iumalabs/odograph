# Quickstart: Fuel Record CRUD + Attachments

## 1. Apply the new migration locally

```sh
wrangler d1 migrations apply odograph-preview --local
```

## 2. Run the automated test suite

```sh
deno task test
```

Expect `tests/server/fuel-record-crud.test.ts` to pass — CRUD lifecycle, cross-tenant isolation,
attachment upload/download (reusing spec 007's proven validation path), and dedicated economy
calculation cases: a vehicle's first fuel record (no economy), two records with increasing
odometer readings (economy present and correct for the second), two records at the same odometer
reading (no economy, not a crash), and a backfilled earlier record changing a later record's
economy on the next read.

## 3. Manual smoke test end-to-end

```sh
deno task dev
```

1. Log a fuel-up on a vehicle with just the required fields (date, odometer, volume, cost) —
   confirm it appears with no fuel-economy figure (this is its vehicle's first record).
2. Log a second fuel-up on the same vehicle with a higher odometer reading — confirm the second
   record now shows a computed economy figure in the unit matching the vehicle's `odometerUnit`
   (L/100km for km vehicles, MPG for mile vehicles).
3. Log a third fuel-up at the *same* odometer reading as the second — confirm it shows "not enough
   data," not an error or an infinite/zero figure.
4. Edit the first record's odometer reading upward (a backfill correction) — confirm the second
   record's economy figure recalculates on the next fetch.
5. Upload a receipt photo to a fuel record — confirm it's listed against that record, and that
   downloading it back shows any GPS EXIF data has been stripped (same proof spec 007 established
   for service records).
6. Delete a fuel record — confirm it's gone from the history immediately and its attachment's R2
   object is gone too (not just the D1-facing API returning 404 for it).
7. Delete the vehicle — confirm every fuel record, its attachments, and every service record and
   its attachments are all gone (extends spec 007's existing vehicle-delete verification).
