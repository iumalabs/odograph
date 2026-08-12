# Phase 1 Data Model: Dev-Only Google OIDC Fixture Sign-In Endpoint

No new data entities, no D1 schema change. This feature reaches the same account/session state the
real Google sign-in flow already produces (`oidc_identities`/`users`/`tenants`, via the existing
`completeGoogleSignIn` → `findOidcIdentityByProviderAndSubject`/`createOidcUser` path), using the
same repository functions, unmodified.
