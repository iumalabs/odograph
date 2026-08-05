# Quickstart: Magic Link Authentication

## 1. Apply the new migration locally

```sh
wrangler d1 migrations apply odograph-preview --local
```

## 2. Run the automated test suite

```sh
npm test
```

Expect `tests/server/magic-link-auth.test.ts` to pass — request/verify lifecycle, cross-method
isolation (D-004), replay/expiry rejection, and response-parity (FR-006) between registered and
unregistered emails.

## 3. Smoke-test that `send_email` actually works (research.md's residual risk)

```sh
npm run deploy:preview   # or push a PR — deploy-preview.yml handles this
```

Against the deployed preview URL:

```sh
curl -s -X POST https://<preview-url>/api/v1/auth/magic-link/request \
  -H "Content-Type: application/json" \
  -d '{"email":"<a real address you control>@example.com"}'
```

Expect `{"sent":true}` and a real email to arrive within a minute or two. If this instead returns
`502` or the deploy logs show an `E_SENDER_NOT_VERIFIED`-shaped error, the zone needs additional
sender verification beyond Email Routing being enabled — see research.md.

## 4. Manual smoke test end-to-end

```sh
npm run dev
```

1. Submit an email you control through the "sign in with email" form.
2. Confirm the email arrives with a link to `/api/v1/auth/magic-link/verify?token=...`.
3. Follow the link — expect a redirect to `/?magicLink=ok` with a session cookie set
   (HttpOnly/Secure/SameSite=Lax, same check as every other auth method's quickstart).
4. Follow the exact same link again — expect `/?magicLink=error`, no new session (FR-004).
5. Submit the same email twice in a row without following either link — confirm only the second
   (latest) link works; the first is invalidated (FR-005).
