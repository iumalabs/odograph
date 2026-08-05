# Quickstart: Semantic Duplicate Detection & Resolution

## 1. Apply the new migration locally

```sh
wrangler d1 migrations apply odograph-preview --local
```

## 2. Run the automated test suite

```sh
deno task test
```

Expect the extended `fuel-record-crud.test.ts` and `service-record-crud.test.ts` to pass —
detection (matching and non-matching cases), the fuel-economy exclusion (a flagged record neither
contributes to nor receives a computed figure), dismiss (both success and the not-flagged/
not-found/not-yours cases), and delete-clears-the-flag (via `ON DELETE SET NULL`).

## 3. Manual smoke test end-to-end

```sh
deno task dev
```

1. Log a fuel-up, then log a second one for the same vehicle with the same date and a
   near-identical odometer reading — confirm the second is visibly flagged as a possible
   duplicate.
2. Log a third, clearly different fuel-up — confirm its fuel-economy figure is computed against
   the *first* record's odometer reading, skipping the flagged second one, and confirm the flagged
   record itself shows a distinct "flagged" state rather than a number or the "not enough data"
   placeholder.
3. Dismiss the flag on the second record — confirm it's no longer shown as flagged, and that the
   third record's fuel-economy figure now recomputes against the second record's odometer reading
   instead of the first's (the calculation is always freshly derived from current data on every
   read, so a dismissed record participates normally in the ordering from that point on, FR-006).
4. Log a service record, then a near-duplicate (same date, same description) — confirm it's
   flagged the same way.
5. Delete the *original* record of a still-flagged pair — confirm the previously-flagged record is
   now shown as normal (unflagged), not orphaned or broken.
