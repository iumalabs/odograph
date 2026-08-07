# Quickstart: API Tokens

`deno task test` covers the automated cases (see `contracts/api.md` and `data-model.md` for exact
shapes). Manual walkthrough via `deno task dev`:

1. Sign in (dev session bootstrap), create a vehicle so there's something to read/write.
2. From the account UI, create a **read-write** token. Confirm the plaintext value is shown once,
   copy it, then reload the token list and confirm the value is never shown again.
3. Using the copied token as `Authorization: Bearer <token>` (curl or similar),
   `GET
   /api/v1/vehicles` — confirm the same vehicle list a session cookie would return. Then
   `POST
   /api/v1/vehicles` with the token — confirm it succeeds.
4. Create a **read** token. Repeat step 3's `GET` (succeeds) and `POST` (confirm
   `403
   read_only_token`, and the vehicle count is unchanged).
5. Attempt `POST /api/v1/tokens` and `DELETE /api/v1/account` using the read-write token from step 2
   as the `Authorization` header instead of a cookie — confirm both are refused (`401`, since these
   routes don't recognize a bearer token at all), and neither the token list nor the account
   changed.
6. Revoke the read-write token from the UI. Immediately retry step 3's `GET` with that same token
   value — confirm `401`, identical to a made-up token value.
7. Delete the account (existing GDPR erasure flow). Confirm every token created above no longer
   works and no longer appears anywhere the API can be reached.
