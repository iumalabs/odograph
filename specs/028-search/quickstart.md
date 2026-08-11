# Quickstart: Search Across Vehicles and Records

No new infrastructure to provision — this feature adds no table, no dependency, no binding.

## 1. Run the automated test suite

```sh
deno task test
```

Expect `tests/server/search.test.ts` to pass — per-entity-type match correctness, cross-tenant
isolation, case-insensitivity, partial-word matching, short-query rejection, empty-result
validity, duplicate-record inclusion (the deliberate divergence from the aggregate features), and
`%`/`_` escaping in the query.

## 2. Manual smoke test end-to-end

```sh
deno task dev
```

1. Create two vehicles, each with a service record, a fuel record, and a document containing a
   shared distinctive word (e.g. "Bridgestone") in different fields.
2. Search for that word (in a different case than it was entered) — confirm results from both
   vehicles appear, each clearly labeled with which vehicle it belongs to.
3. Search for a one-character query — confirm it's rejected rather than returning results.
4. Search for a term matching nothing — confirm an empty, valid result set, not an error.
5. Flag one of the service records as a duplicate of another (via the existing dismiss-duplicate
   flow's inverse — i.e. create a same-date/same-description pair) and search for its text —
   confirm the duplicate-flagged record still appears in results.
