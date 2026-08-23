# Phase 0 Research: Production Error & Performance Monitoring (FlightDeck)

## Decision: Official first-party Sentry SDKs — `@sentry/cloudflare` (server) + `@sentry/react` (client)

**Decision**: Use Sentry's own first-party SDKs rather than hand-rolling calls against FlightDeck's
Sentry-compatible ingest protocol. Server (Cloudflare Workers/Hono): `@sentry/cloudflare`. Client
(React 19 SPA): `@sentry/react`.

**Rationale**: Same reasoning this project already applies to `jose` (specs/003/004) and
`web-push-browser` (specs/022) — a well-scoped, actively-maintained library over hand-rolling a
protocol (envelope format, retry/backoff, breadcrumb batching) that's easy to get subtly wrong and
hard to verify without live infrastructure. `@sentry/cloudflare` is Sentry's own Workers-native SDK
(not the generic Node SDK), so it doesn't drag in `nodejs_compat`-incompatible assumptions beyond
what it explicitly documents needing (see next decision).

**Alternatives considered**:
- **Generic `@sentry/node` server-side**: rejected — targets Node's `http`/`crypto` modules, not
  `workerd`; this project has no `nodejs_compat`-dependent code today and `@sentry/cloudflare` exists
  specifically to avoid needing the wider Node compatibility surface `@sentry/node` would require.
- **Hand-rolled `fetch()` calls to the DSN's ingest endpoint**: rejected — reimplements Sentry's
  envelope format and retry semantics for no benefit; FlightDeck's DSN is explicitly
  Sentry-protocol-compatible so the standard SDK is a first-class client, not a workaround.

## Decision: `nodejs_compat` compatibility flag is required and is a new addition to `wrangler.toml`

**Decision**: `@sentry/cloudflare` needs Node's `AsyncLocalStorage` API (used internally for
request-scoped context propagation) and its own docs state the `nodejs_compat` compatibility flag is
required in `wrangler.toml`. This project's `wrangler.toml` has no `compatibility_flags` entry today
— this feature introduces the first one.

**Rationale**: Directly required by the SDK; there is no way to use `@sentry/cloudflare`'s
`withSentry()` wrapper without it, confirmed against Sentry's own Cloudflare Workers documentation.

**Constitution check**: Principle X ("Deno MUST NOT be used as a source of runtime APIs inside Worker
code... targets `workerd`") is about Deno-runtime APIs leaking into Worker code, not about `workerd`'s
own compatibility flags — `nodejs_compat` is a `workerd`-native compatibility layer supplied by
Cloudflare, unrelated to Deno, so this doesn't touch that principle. No violation.

**Alternatives considered**:
- **Omit the flag and see if it works anyway**: rejected — the SDK's own documentation states it's
  required; shipping without it risks a runtime failure specifically in production error paths,
  which is the one place this feature cannot afford to be silently broken.

## Decision: Server wrapping via `Sentry.withSentry()` around the existing `{ fetch, scheduled }` export

**Decision**: `src/server/index.ts`'s existing `export default { fetch, scheduled } satisfies
ExportedHandler<Env>` gets wrapped: `export default Sentry.withSentry(env => ({ dsn: ..., environment:
env.ENVIRONMENT, release: APP_VERSION, tracesSampleRate: ... }), { fetch, scheduled })`. Confirmed
against the SDK's own usage example (`sentry-javascript` repo, `packages/cloudflare/README.md`):
`withSentry` takes an env-accessor config function and the handler object, and returns a new default
export — a direct fit for this file's existing shape, no restructuring of the `fetch`/`scheduled`
logic itself needed.

**Rationale**: This is the SDK's documented, standard integration point for a Workers `fetch`+
`scheduled` export — not a custom pattern. Preserves the existing CSP-nonce/asset-serving logic in
`fetch` and the existing reminder-sweep logic in `scheduled` completely unchanged; `withSentry` only
adds instrumentation around them.

**Alternatives considered**:
- **Manual `Sentry.captureException()` calls added inside each route handler's error paths**: rejected
  — far more invasive (touches every route file), and still misses errors thrown outside a route
  handler's own try/catch (e.g. in Hono's own middleware chain or the `scheduled` sweep) that
  `withSentry`'s outer wrapping catches for free.

## Decision: The DSN is a plain literal constant in source, not environment-scoped/secret configuration

**Decision**: The FlightDeck DSN is written directly as a string constant at its two points of use
(the client's monitoring-init module and the server's monitoring-wrapper module) — not a Workers
secret, not a build-time-injected env var pulled from CI secrets.

**Rationale**: This project does treat comparable-looking values as protected secrets elsewhere
(`GOOGLE_CLIENT_SECRET`, `VAPID_PRIVATE_KEY`) — but those protect something a leak would actually
compromise (an OAuth client secret, a private signing key). A Sentry-protocol DSN is, by the
protocol's own design, a write-only event-submission identifier meant to be embedded in
publicly-shipped client code (confirmed by FlightDeck's own message: it grants no read/dashboard
access, only submission to one project) — and this app's own client bundle is fully public, so the
value is visible to anyone regardless of how the server obtains it. Treating it as a protected secret
would add real process overhead (a new Workers-secret entry, a new CI-secret-to-build-time-env
plumbing path) for zero actual confidentiality gain. This mirrors the project's existing precedent of
duplicating a plain, non-sensitive literal at each point of use rather than centralizing it — see
`FROM_ADDRESS = "auth@odograph.dev"`, independently declared in both `magic-link.ts` and
`reminder-notification.ts` — rather than introducing a new cross-`src/client`/`src/server` shared
module (no existing precedent for that boundary in this codebase either).

**Alternatives considered**:
- **Workers secret + CI-injected build-time client env var** (the originally-planned approach before
  this was reconsidered mid-implementation): rejected — adds a secret-rotation/CI-plumbing story for a
  value that provides no confidentiality benefit once shipped to the browser; over-engineering for
  this specific credential's actual risk profile.
- **Centralized shared constant file imported by both `src/client` and `src/server`**: rejected — no
  existing precedent for cross-importing between those two trees in this codebase; two independently
  duplicated literals is both simpler and consistent with the `FROM_ADDRESS` precedent above.

## Decision: Production-only gating is an explicit environment check, not a presence check

**Decision**: Since the DSN is now a constant that's always present in source (see above), FR-004
("no preview/dev events") is enforced with an explicit environment-name comparison rather than
"is a secret configured" — mirroring how `ENVIRONMENT` is already read server-side (`env.ENVIRONMENT
=== "production"`, from the existing `[env.production.vars] ENVIRONMENT = "production"` /
`[env.preview.vars] ENVIRONMENT = "preview"` / top-level `ENVIRONMENT = "development"` in
`wrangler.toml`). Client-side needs a new build-time constant — `import.meta.env.PROD` alone is
insufficient (it's `true` for both `build:preview` and `build:production`, per `vite.config.ts`'s own
existing comment on why `WRANGLER_ENV` rather than Vite's own mode distinguishes them) — so
`vite.config.ts` gains a `define` entry exposing `WRANGLER_ENV` to client code as a build-time
constant, read only at Sentry-init time.

**Rationale**: Directly required by FR-004 and the "what happens during local development or a PR
preview deployment" edge case in spec.md. Reuses the exact `ENVIRONMENT`/`WRANGLER_ENV` values this
project already threads through both the server (`wrangler.toml` vars) and the build (`vite.config.ts`
env-selection logic) rather than inventing a third distinct environment-naming scheme for this one
feature.

**Alternatives considered**:
- **Gate only by presence of a build-time-injected DSN** (the presence-check pattern this project uses
  for optional VAPID secrets): no longer applicable once the DSN itself is a constant present in every
  build; an explicit environment check is the only remaining option once that changed.

## Decision: `connect-src` is added to the CSP unconditionally, not only for the production build

**Decision**: `buildCspHeader()` (`src/server/security/csp.ts`) currently has no `connect-src`
directive, which falls back to `default-src 'self'` — this blocks the browser SDK's `fetch()` calls to
FlightDeck's ingest origin outright. This feature adds `connect-src 'self' https://flightdeck.iuma.dev`
to the policy, applied the same way in every environment CSP is already active in (preview and
production — CSP is already skipped entirely in local dev per the function's existing caller in
`index.ts`), rather than conditionally including the directive only when monitoring is actually
enabled for that environment.

**Rationale**: FR-006 requires the policy to allow only this one specific origin, which this satisfies
exactly — it doesn't require the allowance itself to be conditional. Making `buildCspHeader()`
environment-aware would mean threading environment information into a function that currently takes
only a nonce, for a directive that's inert (never actually used) on preview anyway since preview never
initializes the client SDK (per the environment check above). The narrowest-necessary-values principle
this policy already follows (research.md, specs/015) is about not granting unused capabilities that
could be exploited — a connect-src entry that's allowed but never exercised because no code ever calls
it isn't an exploitable capability the way, say, a wildcard `script-src` would be.

**Alternatives considered**:
- **Thread an `isMonitoringEnabled`/environment flag into `buildCspHeader()`**: rejected — real added
  complexity (new parameter, new call-site wiring) for a directive whose unconditional presence carries
  no meaningful risk.

## Decision: Release tag reuses the existing `.release-please-manifest.json` value on both sides

**Decision**: The server imports `.release-please-manifest.json` directly (`import manifest from
"../../.release-please-manifest.json"`), the same way `src/client/version.ts` already does, rather
than using `@sentry/cloudflare`'s alternate `CF_VERSION_METADATA` binding-based release detection.

**Rationale**: Directly required by FR-010 ("the same value shown in the app's own version display").
Using `CF_VERSION_METADATA` instead would tag Sentry releases with Cloudflare's internal Worker
version id, which is a different identifier than the one already user-visible in the app and in
`CHANGELOG.md`/git tags — introducing a second, disconnected version scheme purely for this feature
would make issues harder to correlate with an actual release, not easier.

**Alternatives considered**:
- **`CF_VERSION_METADATA` binding** (the SDK's own auto-detection default): rejected for the reason
  above — correct SDK-default behavior, wrong identifier for this project's needs.

## Decision: PII scrubbing — SDK defaults plus one explicit `beforeSend` scrubber, on both sides

**Decision**: Neither SDK is configured with `sendDefaultPii: true` (the SDKs' own default is `false`,
meaning no automatic IP address/cookie capture) — this default is deliberately kept, not overridden.
Both `Sentry.init` (client) and the `withSentry` config (server) additionally get a `beforeSend` hook
that strips the `Cookie`/`Authorization` request headers and any request-body payload from the
outgoing event before it leaves the application, as defense-in-depth beyond the SDK default.

**Rationale**: Directly required by FR-005 and the "free-text user content" edge case. Relying solely
on the SDK default is fragile against a future config change accidentally flipping
`sendDefaultPii`; an explicit scrubber makes the no-PII guarantee something this codebase enforces
itself rather than something it merely doesn't override. The exact `@sentry/cloudflare` config-object
shape for header/body exclusion (its docs reference a `dataCollection` option, e.g. `httpBody`/
`userInfo` toggles, alongside the standard `beforeSend` hook available on every Sentry SDK) will be
confirmed against the installed package's actual TypeScript types during implementation rather than
locked down here from documentation summaries alone.

**Alternatives considered**:
- **Rely on SDK defaults only, no explicit `beforeSend`**: rejected — meets FR-005 today but is one
  accidental config change away from silently regressing it; not worth the small amount of code saved.
