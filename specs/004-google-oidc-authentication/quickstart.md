# Quickstart: Google OIDC Authentication

## 1. Prerequisite: a real Google OAuth client (one-time, external, owner action)

1. In [Google Cloud Console](https://console.cloud.google.com/), create (or reuse) a project, then
   an OAuth 2.0 Client ID of type "Web application".
2. Authorized redirect URIs — add exactly these two (research.md explains why not a per-PR preview
   URL):
   - `https://odograph.dev/api/v1/auth/oidc/google/callback`
   - `http://localhost:5173/api/v1/auth/oidc/google/callback`
3. Scopes requested by this app: `openid email profile` — non-sensitive, no Google app-verification
   review needed to use the client immediately.
4. Set the resulting client id/secret as Workers secrets, once per environment (not committed to
   `wrangler.toml` — research.md):
   ```sh
   wrangler secret put GOOGLE_CLIENT_ID --env preview
   wrangler secret put GOOGLE_CLIENT_SECRET --env preview
   wrangler secret put GOOGLE_CLIENT_ID --env production
   wrangler secret put GOOGLE_CLIENT_SECRET --env production
   ```
   For local dev, put the same two values in `.dev.vars` (gitignored).

## 2. Apply the new migration locally

```sh
wrangler d1 migrations apply odograph-preview --local
```

## 3. Run the automated test suite

```sh
npm test
```

Expect `tests/server/oidc-auth.test.ts` to pass — state issuance/consumption, ID token verification
against a locally-signed fixture (no real Google network call), and cross-method isolation (D-004,
verified the same way specs/003's magic-link/passkey isolation test was: seed a passkey account for
an email, then confirm a Google sign-in reporting that same email resolves to a different tenant).

## 4. Manual smoke test end-to-end (local dev only — see research.md on preview deploys)

```sh
npm run dev
```

1. Click "Continue with Google" and complete Google's real consent screen with an account you
   control.
2. Expect a redirect back to `/?oidc=ok` with a session cookie set (HttpOnly/Secure/SameSite=Lax,
   same check as every other auth method's quickstart).
3. Sign out (or clear the cookie) and repeat with the same Google account — expect the same tenant,
   not a new one (verifies FR-003 outside the automated suite too, against Google's real tokens).
4. Deny consent on Google's screen instead of approving it — expect a redirect to `/?oidc=error`, no
   cookie set, and confirm via `wrangler d1 execute odograph-preview --local` that no new
   `tenants`/`users`/`oidc_identities` rows were written (FR-006).

## 5. Re-verify after merge, against production

Once this feature is deployed to `https://odograph.dev` (GitHub Actions only — no local `wrangler
deploy`, Principle XII), repeat step 4's flow there to confirm the production redirect URI works
end-to-end, mirroring magic-link's post-merge production re-verification.
