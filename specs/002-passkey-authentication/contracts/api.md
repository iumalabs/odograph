# API Contracts: Passkey Authentication

All routes under `/api/v1/auth/passkey`. `register/*` and `login/*` are rate-limited via
`rateLimitByIp` (no session exists yet at either call — matches the pattern the dev-session route
already uses). `add/*` is rate-limited via `rateLimitBySession` instead, since it requires an
existing session (see below) — same middleware order as the existing tenant-isolation-probe route.

## `POST /api/v1/auth/passkey/register/options`

Starts a registration ceremony. No account required, no body required.

**Response** `200`: WebAuthn `PublicKeyCredentialCreationOptions` (as produced by
`@simplewebauthn/server`'s `generateRegistrationOptions`), with `authenticatorSelection.residentKey`
set to require a discoverable credential. The returned `challenge` is also stored server-side (see
data-model.md) with a short expiry.

## `POST /api/v1/auth/passkey/register/verify`

Completes registration. Body: the browser's `RegistrationResponseJSON` (from
`@simplewebauthn/browser`'s `startRegistration()`), plus `{ "email": string }` for the new account's
contact address.

**Response** `200`: on successful verification — sets the session cookie (identical shape to the
dev-session route's) and returns `{ "userId": string, "tenantId": string }`. Creates exactly one new
tenant, one new user, and one new credential (FR-001, FR-010).

**Response** `400`: the challenge is missing/expired/already consumed, or the response doesn't
verify against it (FR-007, FR-008).

**Response** `409`: the credential ID is already registered — to any account (FR-006). Same status
as the `add/verify` conflict response below, for the same underlying rule.

## `POST /api/v1/auth/passkey/login/options`

Starts a login ceremony. No body required — no `allowCredentials` list is sent, so the browser shows
every discoverable passkey it has for this site (research.md's discoverable-credential decision).

**Response** `200`: WebAuthn `PublicKeyCredentialRequestOptions`. The challenge is stored
server-side the same way as registration's.

## `POST /api/v1/auth/passkey/login/verify`

Completes login. Body: the browser's `AuthenticationResponseJSON` (from `@simplewebauthn/browser`'s
`startAuthentication()`).

**Response** `200`: sets the session cookie, returns `{ "userId": string, "tenantId": string }` —
the _existing_ tenant the credential belongs to (FR-003).

**Response** `401`: the credential ID in the response isn't registered to anyone, the cryptographic
verification fails, or the reported signature counter didn't advance (clone detection —
data-model.md). All three cases return the same response shape, so a client can't distinguish "no
such credential" from "invalid response" (FR-004, SC-003).

**Response** `400`: the challenge is missing/expired/already consumed (FR-007).

## `POST /api/v1/auth/passkey/add` (requires an existing session)

User Story 3 — registers an additional passkey for the _currently authenticated_ user. Requires
`tenantContext` middleware (an existing, valid session), unlike the four routes above.

**Request flow**: same options/verify shape as registration, but scoped to
`/api/v1/auth/passkey/add/options` and `/api/v1/auth/passkey/add/verify`, and `verify` calls
`addCredentialToUser` for the already-resolved user instead of `createCredentialedUser`.

**Response** `200` (verify): `{ "credentialId": string }`.

**Response** `409` (verify): the credential is already registered — to this account or another
(FR-006, User Story 3 Scenario 2).

**Response** `401`: no valid session (same as any `tenantContext`-gated route).
