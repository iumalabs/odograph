# Quickstart: Account Linking Rules

## 1. Apply the new migration locally

```sh
wrangler d1 migrations apply odograph-preview --local
```

## 2. Run the automated test suite

```sh
npm test
```

Expect the extended `tests/server/magic-link-auth.test.ts` and `tests/server/oidc-auth.test.ts` to
pass: link-then-sign-in-with-that-identity lifecycle for both methods, and rejection of linking an
identity already attached to any account (own or different) for both methods.

## 3. Manual smoke test end-to-end

```sh
npm run dev
```

1. Sign up with a passkey (or sign in if you already have an account from earlier testing).
2. In the authenticated view, submit an email through "Link email" and follow the resulting link —
   confirm it redirects to `/?magicLink=linked` (not `/?magicLink=ok`) and that the session is still
   the same account.
3. Sign out, then sign in via magic link using that same email — confirm it resolves to the same
   account, not a new one.
4. Back in the authenticated view, attempt to link the *same* email again — confirm it's rejected
   (`/?magicLink=error`) rather than silently succeeding again.
5. Repeat steps 2-4 for "Link Google account" (requires the real Google OAuth client from
   specs/004's quickstart.md — same local-dev-only limitation on per-PR previews applies here for
   the same reason).
