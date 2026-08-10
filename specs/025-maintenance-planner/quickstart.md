# Quickstart: Maintenance Planner — Kanban Board

No new infrastructure to provision — this feature adds one D1 table and reuses every other
existing binding/dependency.

## 1. Apply the new migration locally

```sh
wrangler d1 migrations apply odograph-preview --local
```

## 2. Run the automated test suite

```sh
deno task test
```

Expect `tests/server/plan-card-crud.test.ts` to pass — CRUD lifecycle, cross-tenant isolation,
stage-value validation, the done-transition creating exactly one service record (with and without
a known vehicle odometer), a repeated done-transition being a no-op, delete never touching
`service_records`, and vehicle deletion cascading a vehicle's plan cards.

Also confirm the existing offline-queue tests (`queue.test.ts`/`merge.test.ts` equivalents, if
present) still pass after adding `"planCard"` to `PendingActionEntity`.

## 3. Manual smoke test end-to-end

```sh
deno task dev
```

1. Add a card to a vehicle with just a title — confirm it appears in the "idea" column.
2. Advance it through buy → doing → done using the client's forward-advance control — confirm it
   moves columns each time.
3. Check the vehicle's service history — confirm moving the card to "done" added exactly one new
   service record with the card's title, today's date, and (if the vehicle has any fuel/service
   history already) a populated odometer reading.
4. Go offline (devtools network throttling), add another card and advance it to "done," then go
   back online — confirm the queued writes sync and the resulting service record appears once
   connectivity returns.
5. Delete a card — confirm it disappears from the board and no service record was created or
   removed by the deletion.
