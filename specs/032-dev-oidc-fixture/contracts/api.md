# API Contracts: Dev-Only Google OIDC Fixture Sign-In Endpoint

## `GET /api/v1/_dev/oidc-google?email=<email>`

**Production behavior**: Identical to a route that does not exist — `404`, no body, no session
issued, no account resolution performed, regardless of the input. `notFoundOutsideDev` runs before
anything else.

**Non-production behavior**:

- **Response** `302` (success): Redirects to `/?oidc=ok`, with `Set-Cookie` issuing a working
  session — the exact same response shape `GET /api/v1/auth/oidc/google/callback` produces on a
  successful real sign-in. The account resolved is keyed by a subject deterministically derived
  from `email` (research.md), so calling this endpoint again with the same `email` resolves the
  same account rather than creating a duplicate (FR-002).
- **Response** `400` (missing `email`): No session issued, no account touched (FR-007).

No other method, no other parameter. This route only ever completes a *sign-in* — it has no
account-linking variant (spec.md FR-008, out of scope).

## Cross-cutting

- Not part of the real OIDC flow (`/start`, `/link`, `/callback`) — those routes and their behavior
  are entirely unchanged by this feature.
- The account/session this endpoint produces is a real, fully-functional account/session — usable
  for any authenticated request exactly as one from the real flow would be (FR-003).
