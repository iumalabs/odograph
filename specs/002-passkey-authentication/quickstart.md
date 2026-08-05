# Quickstart: Passkey Authentication

## 1. Apply the new migration locally

```sh
wrangler d1 migrations apply odograph-preview --local
```

## 2. Run the automated test suite

```sh
npm test
```

Expect `tests/server/passkey-auth.test.ts` to pass, exercising registration/login against fixture
WebAuthn responses (see research.md — no real authenticator involved), challenge replay/expiry
rejection, and duplicate-credential rejection, per spec.md's Acceptance Scenarios.

## 3. Manual smoke test in a real browser (requires a platform authenticator — Touch ID, Windows

Hello, or a security key; `wrangler dev` serves over `http://localhost`, and `localhost` is
WebAuthn's documented HTTPS exception)

```sh
npm run dev
```

Open `http://localhost:8787` in a browser with a platform authenticator available:

1. Click "Sign up with passkey" — complete the browser's passkey creation prompt. Expect to land in
   an authenticated state (the minimal UI should reflect this — e.g. show the tenant/user id
   returned by `register/verify`).
2. Open dev tools → Application → Cookies, confirm the session cookie is present with
   HttpOnly/Secure/SameSite=Lax (same check as specs/001's quickstart, now exercised via a real
   ceremony instead of the dev-session route).
3. Clear cookies (simulate a new browser session) and click "Sign in with passkey" — the browser
   should show the passkey created in step 1 without being asked for a username, per the
   discoverable-credential design (research.md). Confirm you land back in the _same_ tenant/user id
   as step 1, not a new one (FR-003).
4. From the authenticated state, trigger "Add another passkey" (if using a platform with more than
   one available authenticator, e.g. a security key alongside Touch ID) and confirm both passkeys
   independently sign you into the same account afterward (User Story 3).

## 4. Confirm rejection paths

```sh
# Replay: submit the same register/verify body twice in a row — second attempt must 400
# (challenge already consumed). Easiest checked via the automated test, not manually.
```
