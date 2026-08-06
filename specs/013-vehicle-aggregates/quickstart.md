# Quickstart: Server-Computed Per-Vehicle Aggregates

No migration — this feature reads existing tables only.

## 1. Run the automated test suite

```sh
deno task test
```

Expect `tests/server/vehicle-aggregates.test.ts` to pass — division-safety edge cases (zero
records, one record, records sharing an odometer reading or a date, duplicate-flagged records
excluded), independence between the three aggregates (one being `null` never blocks the others),
and the not-found-or-not-yours contract for a missing or cross-tenant vehicle id.

## 2. Manual smoke test end-to-end

```sh
deno task dev
```

Using the dev session bootstrap route (`POST /api/v1/_dev/session`) and the existing vehicle/
service-record/fuel-record creation routes:

1. Create a vehicle with zero records. `GET /api/v1/vehicles/:id/aggregates` — confirm `200` with
   `costPerDistance`, `costPerTime`, and `averageFuelEconomy` all `null`.
2. Log a single fuel record. Fetch aggregates again — confirm all three are still `null` (one
   record alone has no span to divide by).
3. Log a second fuel record at a higher odometer reading and a later date, with a different cost.
   Fetch aggregates — confirm `costPerDistance` and `costPerTime` are now non-null numbers, and
   `averageFuelEconomy` matches the second fuel record's own per-record economy figure (only one
   fuel record has a computable economy at this point — itself).
4. Log a service record for the same vehicle with its own cost and odometer reading. Fetch
   aggregates — confirm `costPerDistance`/`costPerTime` now reflect the combined cost and combined
   odometer/date span across both record types.
5. Log a third fuel record at the *same* odometer reading as an existing record. Fetch aggregates
   — confirm the response is still well-formed (no error), reflecting that this record doesn't
   widen the distance span on its own.
6. Create a fuel record that gets semantic-duplicate-flagged (spec 010) against an existing one.
   Fetch aggregates — confirm its cost and odometer reading are excluded from the totals (compare
   against the aggregate value from before creating it).
7. Request aggregates for a vehicle id that doesn't exist, and separately for a vehicle belonging
   to a different tenant's session — confirm both return `404` indistinguishably.
