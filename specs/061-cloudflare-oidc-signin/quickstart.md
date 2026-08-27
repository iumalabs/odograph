# Quickstart: Cloudflare OIDC Sign-In

## 1. Prerequisite: a real Cloudflare Access "Generic OIDC" application (one-time, external, owner action)

1. In the Cloudflare dashboard, under Zero Trust → Access → Applications, add a SaaS application,
   choosing "Generic OIDC" (or a custom name if not pre-listed) as the type — this requires a Zero
   Trust team already set up (a `<team-name>.cloudflareaccess.com` tenant); creating one is a
   Cloudflare-side prerequisite outside this feature's own scope.
2. Redirect URL — add exactly these two (same reasoning as Google's quickstart: no per-PR preview
   URL, research.md Decision 10):
   - `https://odograph.iuma.dev/api/v1/auth/oidc/cloudflare/callback`
   - `http://localhost:5173/api/v1/auth/oidc/cloudflare/callback`
3. Scopes: `openid`, `email` at minimum (matches what `verifyOidcIdToken` requires — `sub` and
   `email` claims).
4. Define an Access policy controlling who can actually authenticate through this application —
   deny-by-default (research.md's Assumptions in spec.md: this is what makes the audience
   operator-controlled, not open-to-any-Cloudflare-user).
5. Copy the resulting team domain, client id, and client secret; set them as Workers secrets, once
   per environment:
   ```sh
   wrangler secret put CLOUDFLARE_ACCESS_TEAM_DOMAIN --env preview
   wrangler secret put CLOUDFLARE_ACCESS_CLIENT_ID --env preview
   wrangler secret put CLOUDFLARE_ACCESS_CLIENT_SECRET --env preview
   wrangler secret put CLOUDFLARE_ACCESS_TEAM_DOMAIN --env production
   wrangler secret put CLOUDFLARE_ACCESS_CLIENT_ID --env production
   wrangler secret put CLOUDFLARE_ACCESS_CLIENT_SECRET --env production
   ```
   For local dev, put the same three values in `.dev.vars` (gitignored).

**This step is genuinely optional** (FR-004) — everything in steps 2-3 below works with zero
Cloudflare Access configuration present; only step 4's real end-to-end manual smoke test needs it.

## 2. Run the automated test suite

```sh
deno task test
```

Expect `tests/server/cloudflare-oidc-auth.test.ts` to pass — same shape as
`tests/server/oidc-auth.test.ts`: state issuance/consumption, ID token verification against a
locally-signed fixture (no real Cloudflare network call), account-linking conflict rejection, and
cross-provider isolation (a Cloudflare sign-in and a Google sign-in reporting the same email
resolve to two different tenants, not one — D-004).

```sh
deno task check
```

fmt/lint/typecheck/full suite/build — must all pass.

## 3. Manual smoke test without real Cloudflare Access configured

```sh
deno task dev
```

1. Load the landing page — confirm "Continue with Cloudflare" renders (FR-003) even with no
   Cloudflare secrets set locally.
2. Visit the dev-only fixture route directly:
   `http://localhost:5173/api/v1/_dev/oidc-cloudflare?email=you@example.com` — expect the same
   redirect-with-session-cookie behavior a real callback would produce
   (`/?oidc=ok&provider=cloudflare`), without any real Cloudflare network call (mirrors
   `dev-oidc.ts`'s existing role for Google).
3. Confirm the banner reads "Signed in with Cloudflare" (not "Google") — verifies research.md
   Decision 5's `provider` interpolation actually reaches the UI.
4. Repeat with a different, already-signed-in-via-passkey email to exercise the account-linking
   path (`/api/v1/auth/oidc/cloudflare/link` requires an authenticated session first).

## 4. Manual smoke test end-to-end (requires step 1 actually completed — local dev or production only)

1. Click "Continue with Cloudflare" and complete a real Cloudflare Access authentication.
2. Expect a redirect back to `/app?oidc=ok&provider=cloudflare` with a session cookie set
   (HttpOnly/Secure/SameSite=Lax).
3. Repeat with the same identity — expect the same tenant, not a new one (FR-001).
4. Attempt authentication with an identity your Access policy denies — expect Cloudflare's own
   access-denied page, never reaching Odograph's callback at all (spec.md Edge Cases).

## 5. Re-verify after merge, against production

Once deployed to `https://odograph.iuma.dev` (GitHub Actions only, Principle XII) — and only once
iumalabs has actually completed step 1 for their own production Cloudflare Access setup — repeat
step 4's flow there, mirroring Google's and magic-link's own post-merge production re-verification
precedent.
