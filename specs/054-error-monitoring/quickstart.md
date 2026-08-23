# Quickstart: Production Error & Performance Monitoring (FlightDeck)

`deno task check` covers the environment-gating logic and the `beforeSend` PII scrubber
(`tests/server/monitoring.test.ts`) plus the full existing suite. The actual outbound event
submission to FlightDeck and the client-side SDK's own capture behavior have no equivalent under
`vitest`/`workerd` — verify live per the walkthrough below, using a real production-mode build,
since capture is deliberately disabled everywhere else (FR-004).

## Manual walkthrough

1. `deno task build:production` (locally, for verification only — the constitution's
   GitHub-Actions-only deploy rule still applies to actually shipping this to the real production
   URL; see step 6).
2. **Server error appears (User Story 1)**: temporarily trigger an unhandled error in an API route
   (e.g. a route handler that throws), hit it, and confirm an issue appears in FlightDeck's Issues
   view for the Odograph project within a few minutes, with a readable stack trace and no
   `Cookie`/`Authorization` header or request body attached to the event.
3. **Client error appears (User Story 1)**: trigger an unhandled error in the client (e.g. a
   temporary `throw` in a component), reload, and confirm the same — an issue in FlightDeck within
   a few minutes.
4. **User-facing behavior is unaffected on capture failure**: temporarily point the DSN at an
   unreachable host (or block the ingest origin), repeat step 2. Confirm the API request still
   completes with its normal error response — the monitoring capture attempt must not change or
   delay what the user sees (FR-007).
5. **Release attribution (User Story 2)**: note the release tag on the issues from steps 2-3;
   confirm it matches the app's own version display (`APP_VERSION`, `.release-please-manifest.json`)
   for the build under test, not a Cloudflare-internal version id. Then bump
   `.release-please-manifest.json` to a second version, rebuild, and trigger a new error unique to
   this second build. Confirm FlightDeck's release view attributes the new issue to the second
   release while the earlier issue stays attributed to the first — not merged into one
   undifferentiated stream (spec.md US2's own two-release Independent Test).
6. **No preview/dev leakage (FR-004)**: `deno task build:preview` and repeat steps 2-3 against that
   build. Confirm no corresponding issues appear in FlightDeck's Odograph project — preview and
   local-dev capture must be a no-op.
7. **Performance trace sampling (User Story 3)**: generate a burst of requests against the
   production-mode build and confirm a proportion (not all) appear as traces in FlightDeck's Traces
   view, with a duration breakdown that distinguishes request handling from underlying data access
   (e.g. D1 queries) as its own step — not a single flat duration for the whole request.
8. **CSP still blocks everything else**: with browser devtools open on the production-mode build,
   confirm the page's CSP header now includes `connect-src 'self' https://flightdeck.iuma.dev` and
   that no other new origin was added — spot-check that an unrelated cross-origin `fetch()` from the
   console is still blocked by CSP, same as before this feature (FR-006).
9. **Real deploy**: once the above pass against local production-mode builds, ship normally through
   `deploy-preview.yml`/`deploy-production.yml` (no new secret to provision — the DSN is a plain
   source literal, research.md) and repeat step 2 or 3 once against the real deployed URL to confirm
   the same behavior holds outside a local build.
