# Quickstart: Monthly/Annual Expense Analytics

No new infrastructure to provision — this feature adds no table, no dependency, no binding.

## 1. Run the automated test suite

```sh
deno task test
```

Expect the extended `tests/server/vehicle-aggregates.test.ts` to pass — monthly and yearly
grouping with correct sums, zero-record vehicles returning an empty list, missing-cost records
contributing zero, semantic-duplicate exclusion, chronological ordering, an invalid/missing
`groupBy` rejected with `400`, and cross-tenant refusal.

## 2. Manual smoke test end-to-end

```sh
deno task dev
```

1. Add service and fuel records for a vehicle across at least two different calendar months (and,
   if convenient, two different years) with varying costs, including one service record with no
   cost.
2. View the vehicle's dashboard — confirm the monthly breakdown shows exactly the populated
   months, with correct maintenance/fuel/total figures per month.
3. Switch to the yearly view — confirm the same records are now grouped by year, with year totals
   equal to the sum of their months' totals.
4. Confirm a vehicle with no records at all shows an empty breakdown, not an error.
