# Quickstart: Maintenance History PDF Export

## 1. Install the new dependency

```sh
deno install
```

(after adding `"pdf-lib": "npm:pdf-lib@^1.17.1"` to `deno.json`'s `imports` map)

## 2. Run the automated test suite

```sh
deno task test
```

Expect `tests/server/pdf-export.test.ts` to pass — `buildReportData` unit tests (correct rows,
correct "not provided" fallbacks, correct summary sums, duplicate exclusion) and route-level
integration tests (valid PDF returned with the right `Content-Type`/`Content-Disposition`,
cross-tenant refusal, a zero-record vehicle still returning a valid document).

## 3. Manual smoke test end-to-end

```sh
deno task dev
```

1. Add a mix of service and fuel records to a vehicle, including at least one with a missing cost
   and one flagged as a semantic duplicate of another.
2. Click the vehicle's "Download report" action — confirm a PDF file downloads and opens correctly
   in a PDF viewer, showing the vehicle's name, every non-duplicate record with its actual fields
   (missing ones shown as not provided), and correct summary totals.
3. Try the same for a freshly-created vehicle with no records — confirm a valid PDF still
   downloads, noting the absence of history rather than erroring.
