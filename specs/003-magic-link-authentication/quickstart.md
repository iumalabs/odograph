# Quickstart: Magic Link Authentication

## 1. Apply the new migration locally

```sh
wrangler d1 migrations apply odograph-preview --local
```

## 2. Run the automated test suite

```sh
deno task test
```

Expect `tests/server/magic-link-auth.test.ts` to pass — request/verify lifecycle, cross-method
isolation (D-004), replay/expiry rejection, and response-parity (FR-006) between registered and
unregistered emails.

## 3. Smoke-test that `send_email` actually works (research.md's residual risk)

```sh
# push a PR — deploy-preview.yml handles the deploy, never `wrangler deploy` locally
```

Against the deployed preview URL:

```sh
curl -s -X POST https://<preview-url>/api/v1/auth/magic-link/request \
  -H "Content-Type: application/json" \
  -d '{"email":"<a real address you control>@example.com"}'
```

Expect `{"sent":true}` and a real email to arrive within a minute or two.

**Known finding (T007, resolved as a decision, not a bug)**: as of this feature's implementation,
this returns `502` with `env.EMAIL.send()` throwing `"destination address is not a verified
address"` for any recipient that isn't a pre-verified destination address in the Cloudflare
dashboard. Cloudflare's `send_email` binding only reaches arbitrary recipients once the sending
domain (`odograph.dev`) is "onboarded" to Email Service (Compute > Email Service > Email Sending),
which requires the Workers Paid plan and adds SPF/DKIM/DMARC records automatically. This is a
billing/domain-trust action outside CI's authority — the repo owner onboards the domain manually;
re-run this smoke test after that's done. The error handling itself (FR-008: catch and surface, not
swallow) is proven correct by this exact failure being specific and actionable rather than opaque.

## 4. Manual smoke test end-to-end

```sh
deno task dev
```

1. Submit an email you control through the "sign in with email" form.
2. Confirm the email arrives with a link to `/api/v1/auth/magic-link/verify?token=...`.
3. Follow the link — expect a redirect to `/?magicLink=ok` with a session cookie set
   (HttpOnly/Secure/SameSite=Lax, same check as every other auth method's quickstart).
4. Follow the exact same link again — expect `/?magicLink=error`, no new session (FR-004).
5. Submit the same email twice in a row without following either link — confirm only the second
   (latest) link works; the first is invalidated (FR-005).
