# Quickstart: Vehicle CRUD

## 1. Apply the new migration locally

```sh
wrangler d1 migrations apply odograph-preview --local
```

## 2. Run the automated test suite

```sh
npm test
```

Expect `tests/server/vehicle-crud.test.ts` to pass — create/list/fetch/update/delete lifecycle and
cross-tenant refusal. Expect every other existing test file to still pass unchanged in what it
asserts (only their internal "get my tenantId" helper now calls `/vehicles` instead of the retired
probe route).

## 3. Manual smoke test end-to-end

```sh
npm run dev
```

1. Sign in (any method).
2. Add a vehicle with just a name and an odometer unit — confirm it appears in the list.
3. Add a second vehicle with make/model/year/VIN filled in — confirm all fields are stored.
4. Edit one field on a vehicle — confirm only that field changed.
5. Delete a vehicle — confirm it disappears from the list.
