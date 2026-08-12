# Tasks: VIN Lookup on Vehicle Add

**Input**: Design documents from `/specs/030-vin-lookup/` **Prerequisites**: plan.md, spec.md,
research.md, data-model.md, contracts/api.md, quickstart.md

**Tests**: Included for the server-side proxy's pure response-parsing/error-shaping logic (given a
mocked `fetch`), per this project's established precedent — the live NHTSA network call itself is
deliberately not unit-tested (research.md, matching `google.ts`/`send-reminder-push.ts`).

## Phase 1: Setup

None — no new dependency, no new migration.

## Phase 2: Foundational (blocking prerequisites)

**⚠️ No user story work may start until this phase is complete.**

- [X] T001 Create `src/server/vin-lookup/decode-vin.ts`: `export type DecodeResult = { ok: true;
      make: string | null; model: string | null; year: number | null } | { ok: false }`; export
      `decodeVin(vin: string, fetchImpl: typeof fetch = fetch): Promise<DecodeResult>` — a
      never-throws async function (try/catch, mirrors `google.ts`'s `exchangeCodeForTokens`) that:
      (a) short-circuits to `{ ok: false }` for an obviously-too-short VIN (under 11 chars) without
      calling NHTSA (data-model.md, contracts/api.md); (b) otherwise calls
      `https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/{encodeURIComponent(vin)}?format=json`
      via `fetchImpl`; (c) on a non-2xx response or a thrown error, returns `{ ok: false }`; (d) on
      a 2xx response, reads `Results[0]`, treats a nonzero `ErrorCode` OR all-empty
      `Make`/`Model`/`ModelYear` as `{ ok: false }`, otherwise returns `{ ok: true, make: <Make or
      null>, model: <Model or null>, year: <parsed ModelYear or null> }` — mapping each field
      independently (a non-empty `Make` with an empty `Model` yields `make` set, `model: null`,
      never inferring the gap — FR-003/FR-005)
- [X] T002 [P] Create `tests/server/vin-lookup.test.ts`: unit tests for `decodeVin` using an
      injected mock `fetchImpl` (per T001's signature) covering: a successful full decode (all
      three fields populated); a partial decode (e.g. `Make` present, `Model`/`ModelYear` empty →
      confirms `model`/`year` come back `null`, not guessed); an `ErrorCode != "0"` response
      (→ `ok: false`); a non-2xx response (→ `ok: false`); a thrown/rejected fetch (→ `ok: false`);
      a too-short input VIN (→ `ok: false`, and confirm the mock `fetchImpl` was never called)
- [X] T003 [P] In `src/client/i18n/strings.ts`, add `vehicleVinLabel`, `vehicleMakeLabel`,
      `vehicleModelLabel`, `vehicleYearLabel`, `lookupVinButton`, `vinLookupInProgress`,
      `vinLookupNotFound` (used for both "no usable details" and "lookup failed" per spec.md's
      "distinguishing them is not required")

**Checkpoint**: `decodeVin` exists, is fully unit-tested, and type-checks; new i18n strings exist.
No route or UI wired yet.

---

## Phase 3: User Story 1 - Auto-fill vehicle details from a VIN (Priority: P1) 🎯 MVP

**Goal**: A signed-in owner can enter a VIN, trigger a lookup, and see make/model/year pre-filled
but still editable before saving.

- [X] T004 [US1] Create `src/server/routes/v1/vin-lookup.ts`: `export const vinLookup = new
      Hono<AppEnv>()`; `vinLookup.use("*", tenantContextOrToken)`; `GET /:vin` behind
      `rateLimitBySession` (contracts/api.md, research.md) calling `decodeVin(c.req.param("vin"))`
      and returning `c.json({ found: true, make, model, year })` on `{ ok: true, ... }`, or
      `c.json({ found: false, make: null, model: null, year: null })` with status `200` when
      `decodeVin` returns `{ ok: false }` due to a parseable-but-empty NHTSA result, vs. status
      `503` with the same shape when the underlying call itself failed (contracts/api.md's
      found:false-vs-503 distinction — reuse `decodeVin`'s discriminated result plus a
      transport-vs-empty flag, or simplify to always `200 found:false` if `decodeVin`'s type
      doesn't distinguish the two internally; either is acceptable per spec.md's "not required to
      distinguish in messaging")
- [X] T005 [US1] Wire `vinLookup` into `src/server/index.ts` under `/api/v1/vin-lookup` (import
      alongside the existing route imports, `app.route("/api/v1/vin-lookup", vinLookup)` near
      `app.route("/api/v1/search", search)`)
- [X] T006 [US1] Create `src/client/vin-lookup.ts`: `export type VinLookupResult = { found: boolean;
      make: string | null; model: string | null; year: number | null }`; `export async function
      lookupVin(vin: string): Promise<VinLookupResult>` — a plain `fetch` to
      `/api/v1/vin-lookup/${encodeURIComponent(vin)}`, NOT routed through the offline write queue
      (FR-009); on any fetch/parse failure (network error, non-JSON, etc.) resolves to `{ found:
      false, make: null, model: null, year: null }` rather than throwing, so the caller never needs
      a try/catch around it
- [X] T007 [US1] In `src/client/vehicles.ts`: widen `createVehicle`'s input type to `{ name: string;
      odometerUnit: "km" | "mi"; make?: string | null; model?: string | null; year?: number | null;
      vin?: string | null }` and pass the extra fields through to `enqueue`'s `body`; update
      `hydrateOptimisticVehicle` to read `make`/`model`/`year`/`vin` from `action.body` (defaulting
      each to `null` if absent) instead of hardcoding all four to `null`
- [X] T008 [US1] In `src/client/components/Garage.tsx`: add controlled `vin`, `make`, `model`,
      `year` text inputs to the add-vehicle form (labeled via T003's new i18n keys), plus a "Look
      up" button that's disabled while a lookup is in flight or the VIN field is empty; **also
      disable the VIN input itself while a lookup is in flight** (speckit-analyze finding — without
      this, editing the VIN mid-request lets a stale response pre-fill fields against a VIN the
      owner has since changed, violating FR-011; this is a transient in-flight lock only, not a
      post-success lock, so it doesn't conflict with FR-004's "never locked after a successful
      lookup"); on click, call `lookupVin` and, on `found: true`, set only the fields the result
      actually returned (leave others as whatever the owner already had — FR-003); on `found:
      false`, show `vinLookupNotFound` without altering any field; extend `GarageProps` with the
      new field values and their `onChange` handlers plus an `onLookupVin` callback (App.tsx wires
      the actual `lookupVin` call, keeping `Garage.tsx` a presentational component like its
      existing fields)
- [X] T009 [US1] In `src/client/App.tsx`: add `vehicleVin`/`vehicleMake`/`vehicleModel`/`vehicleYear`
      state (mirroring the existing `vehicleName`/`vehicleOdometerUnit` state), wire them and a
      `lookupVin`-backed handler into `<Garage>`'s new props (T008), and pass the four fields
      through to `createVehicle` in `onAddVehicle`; clear all four alongside `vehicleName` on
      successful creation

**Checkpoint**: `deno task dev` — entering a real decodable VIN and clicking "Look up" pre-fills
make/model/year; saving creates a vehicle with those values; pre-filled fields remain editable.

---

## Phase 4: User Story 2 - Lookup fails gracefully and never blocks vehicle creation (Priority: P1)

**Goal**: Confirm both failure modes (network/service failure, undecodable VIN) degrade to a
non-blocking manual-entry message, and manual save still works.

- [X] T010 [US2] Manually verify quickstart.md's "Validation scenario 2" against `deno task dev`:
      an obviously undecodable VIN produces the `vinLookupNotFound` message, make/model/year stay
      empty and editable, and the vehicle still saves successfully once filled in manually
- [X] T011 [US2] Manually verify a simulated network/service failure (e.g. temporarily disconnect
      the dev server's network, or point `decodeVin`'s NHTSA URL at an unreachable host for the
      test) produces the same non-blocking message and does not prevent manual save (FR-006)

**Checkpoint**: Both failure modes verified non-blocking; T002's unit tests already cover the
server-side half of this mechanically.

---

## Phase 5: User Story 3 - VIN lookup is entirely optional and works offline exactly as before (Priority: P2)

**Goal**: Confirm adding a vehicle without ever touching VIN lookup — including while offline —
is unchanged from pre-feature behavior.

- [X] T012 [US3] Manually verify quickstart.md's "Validation scenario 3": with the dev server
      offline (or VIN lookup simply never triggered), add a vehicle using only name + odometer
      unit; confirm it queues and saves via the existing offline queue exactly as before this
      feature, with no new required field blocking submission (FR-010)

**Checkpoint**: Zero regression to the pre-existing offline add-vehicle flow confirmed.

---

## Phase 6: Polish & Cross-Cutting

- [X] T013 Run `deno task check` (fmt, lint, typecheck, test, build, repository-boundary guard) and
      fix any failures across all files touched by this feature
- [X] T014 Walk through quickstart.md's "Validation scenario 4" (partial decode leaves ungiven
      fields blank, never guessed) against `deno task dev`

## Dependencies

- **Phase 2 (Foundational)** → **all user story phases**: strict — `decodeVin` and the new i18n
  strings are shared by every story.
- **User Story 1 (Phase 3)** → **User Story 2 (Phase 4)** and **User Story 3 (Phase 5)**: strict for
  Phase 4 (nothing to fail-gracefully-verify until the form/route exist); Phase 5 only needs the
  Garage form fields to exist, technically achievable once T008/T009 land.
- **Phase 6 (Polish)**: after everything else.

## Implementation strategy

**MVP = Phase 2 + Phase 3 (User Story 1).** That delivers the actual lookup-and-prefill flow — this
feature's entire value proposition. User Stories 2 and 3 are verification-focused passes confirming
the non-blocking-degradation and offline-parity guarantees that T001/T004/T006's error handling and
T007's additive-only `createVehicle` change already build in by construction.
