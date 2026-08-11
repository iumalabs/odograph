# Research: VIN Lookup on Vehicle Add

## Decision: NHTSA vPIC `decodevinvalues` (flat) endpoint, server-side proxy

**Rationale**: `GET https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/{vin}?format=json` is
free, requires no API key, and returns a flat single-object result (`Results[0]`) that's simpler to
parse than the nested `DecodeVin` variant. Confirmed via direct API research: it always returns
HTTP 200 for a well-formed request — even for an invalid or undecodable VIN — with the actual
outcome signaled inside the payload via `ErrorCode`/`ErrorText` and empty-string `Make`/`Model`/
`ModelYear` fields. This means the server proxy's own success/failure distinction must be built by
inspecting the payload, not by trusting `res.ok` alone (that only rules out transport-level
failures — DNS, timeout, 5xx from NHTSA itself).

Implemented as a server-side proxy (not a direct client-side fetch) for two reasons: (1) this app's
CSP has no `connect-src` directive, so it falls back to `default-src 'self'` — a browser-side fetch
to `vpic.nhtsa.dot.gov` would be blocked outright; (2) centralizing the call server-side lets one
place own rate-limiting, timeout, and error-shape normalization, rather than duplicating that logic
if this lookup is ever surfaced from more than one client entry point later.

**Alternatives considered**: A client-side fetch with a CSP `connect-src` exception carved out for
`vpic.nhtsa.dot.gov` — rejected; it would work, but widens the CSP for a single third-party host
with no compensating benefit over a same-origin server proxy, and diverges from this project's
existing pattern (Google OAuth, Web Push) of keeping all outbound third-party calls server-side.

## Decision: Coverage gap is expected behavior, not an error state

**Rationale**: NHTSA's decode database is US/Canada-market-focused (confirmed via direct research);
non-US-market or older/unusual VINs routinely come back with `ErrorCode` set and empty `Make`/
`Model`/`ModelYear`. Odograph explicitly supports non-US, metric-unit owners as a first-class case
(constitution Principle IX) — treating an empty NHTSA result as a bug or hard error would be wrong.
The spec (User Story 2, FR-007) treats "no usable details found" as a normal, expected outcome with
the same graceful "enter manually" UX as a network failure, not a distinct error condition the
owner needs to understand or work around.

**Alternatives considered**: A paid VIN-decode API with broader international coverage
(VehicleDatabases.com, Vincario) — rejected for this iteration; NHTSA's free tier is the correct
starting point given this project has taken no other paid third-party dependency, and the graceful
degradation this spec requires anyway makes the coverage gap a non-blocking limitation rather than
a feature-breaking one. Worth revisiting only if user feedback shows the gap is a frequent pain
point.

## Decision: `decodeVin` follows the `ExchangeResult` never-throws pattern from `google.ts`

**Rationale**: `src/server/auth/oidc/google.ts`'s `exchangeCodeForTokens` already establishes this
project's pattern for a real external HTTP call: wrap in try/catch, return a discriminated
`{ ok: true, ... } | { ok: false, error: string }` result type, never let a network error escape as
a thrown exception into the route handler. `decodeVin` reuses this exact shape — `DecodeResult =
{ ok: true; make: string | null; model: string | null; year: number | null } | { ok: false }` —
collapsing NHTSA's various failure signals (`ErrorCode != 0`, empty fields, transport failure,
non-2xx) into the same `{ ok: false }` outcome per spec.md's explicit "distinguishing failure modes
in messaging is not required" allowance, keeping the result type simple.

**Alternatives considered**: Surfacing NHTSA's specific `ErrorCode`/`ErrorText` to the client for
richer messaging — rejected as unnecessary complexity; spec.md explicitly says distinguishing
network-failure from undecodable-VIN in the UI message is "not required," so a single generic
"couldn't find details, enter manually" outcome satisfies FR-006/FR-007 without adding a taxonomy
of NHTSA-specific error codes to the client.

## Decision: Rate-limited via the existing `rateLimitBySession` middleware

**Rationale**: The new route makes no D1 write, so constitution Principle VII's literal "every
write path" mandate doesn't strictly apply — but it does relay traffic to a third party under this
app's identity, and an unthrottled endpoint could be abused to hammer NHTSA (whose docs mention an
undocumented automated-traffic control that can temporarily block an abusive IP) via this app as a
relay. Reusing `rateLimitBySession` (`src/server/auth/rate-limit.ts`) — the same mechanism already
applied to every other authenticated write route — is a one-line defense-in-depth addition with no
new infrastructure.

**Alternatives considered**: No rate limiting (since it's a read, not a write) — rejected; the
downside of reusing existing middleware is negligible and the abuse-prevention benefit is real.

## Decision: Form field additions live directly in `Garage.tsx`, not a new component

**Rationale**: `Garage.tsx`'s existing add-vehicle form (name + odometer unit) is not extracted into
its own file — extending it in place with make/model/year/vin/lookup keeps the single add-vehicle
form as one component, matching its current shape rather than introducing a new
`AddVehicleForm.tsx` split for a form that still fits comfortably in one component. `handleAddVehicle`
in `App.tsx` is a single `onAddVehicle: () => void` callback already; it widens to pass the new
fields through to `createVehicle`.

**Alternatives considered**: Extracting the add-vehicle form into its own component file —
rejected as an unrequested refactor; `Garage.tsx` today isn't large enough to warrant it, and the
task is additive (more fields, one more button), not a structural rework.
