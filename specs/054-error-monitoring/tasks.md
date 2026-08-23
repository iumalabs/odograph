# Tasks: Production Error & Performance Monitoring (FlightDeck)

**Input**: Design documents from `/specs/054-error-monitoring/` **Prerequisites**: plan.md, spec.md,
research.md, quickstart.md

**Tests**: The environment-gating (`enabled` flag) and PII-scrubbing logic in the new monitoring
config modules get real `deno task test` coverage — ordinary, fully-testable pure functions. The
actual outbound event submission to FlightDeck and the browser SDK's own runtime capture behavior
have no equivalent under `vitest`/`workerd` and are verified live via quickstart.md, same precedent
as specs/012's email send and specs/022's push send.

## Phase 1: Setup

- [X] T001 Add `@sentry/cloudflare` and `@sentry/react` to `deno.json`'s `imports`
      (`npm:@sentry/cloudflare@latest`, `npm:@sentry/react@latest` — pin the actual resolved
      versions, mirroring how every other dependency in `deno.json` pins a concrete `^x.y.z`), run
      `deno install` to resolve them
- [X] T002 [P] Add `compatibility_flags = ["nodejs_compat"]` to `wrangler.toml`'s top level
      (`@sentry/cloudflare` requires it for `AsyncLocalStorage` — research.md); confirm `deno task
      cf-typegen` still succeeds afterward

---

## Phase 2: Foundational (blocking prerequisites)

**⚠️ No user story work may start until this phase is complete.**

- [X] T003 [P] Extend `vite.config.ts`: add a `define` entry exposing the build's `WRANGLER_ENV`
      value to client code as a build-time constant (e.g. `__WRANGLER_ENV__:
      JSON.stringify(process.env.WRANGLER_ENV ?? "development")`) — `import.meta.env.PROD` alone
      can't distinguish preview from production (research.md)
- [X] T004 [P] Create `src/server/monitoring/config.ts`: exports the FlightDeck DSN as a plain string
      constant and `buildServerMonitoringConfig(env: Env)`, returning the options object for
      `Sentry.withSentry()` — `dsn`, `environment: env.ENVIRONMENT`, `release` (imported from
      `../../../.release-please-manifest.json`, same manifest `src/client/version.ts` already
      reads), `tracesSampleRate` (0.1, per spec.md Assumptions), `enabled: env.ENVIRONMENT ===
      "production"` (FR-004), a `beforeSend` hook stripping `Cookie`/`Authorization` request headers
      and any request-body payload from the outgoing event (FR-005), and any `@sentry/cloudflare`
      `dataCollection`-style option available on the installed version to disable HTTP body/user-info
      capture at the source (confirm exact option names against the installed package's TypeScript
      types — research.md)
- [X] T005 [P] Create `src/client/monitoring.ts`: exports the same DSN constant and
      `buildClientMonitoringConfig()`, returning the options object for `Sentry.init()` — same
      `environment`/`release`/`tracesSampleRate`/`enabled` shape as T004 but reading `__WRANGLER_ENV__`
      (T003) instead of `env.ENVIRONMENT`, plus the matching `beforeSend` scrubber; do not set
      `sendDefaultPii: true` (keep the SDK's own `false` default — research.md)
- [X] T006 [P] Extend `src/server/security/csp.ts`'s `buildCspHeader()`: add
      `connect-src 'self' https://flightdeck.iuma.dev` to the returned directive list (FR-006) —
      applied unconditionally, same as every other directive in this function (research.md)
- [X] T007 Create `tests/server/monitoring.test.ts`: `buildServerMonitoringConfig` returns
      `enabled: true` only when `env.ENVIRONMENT === "production"` (false for `"preview"` and
      `"development"`); its `beforeSend` strips a `Cookie` header, an `Authorization` header, and a
      request-body field from a representative fabricated event, returning the rest of the event
      unmodified; `release` matches the value in `.release-please-manifest.json` exactly (depends on
      T004)

**Checkpoint**: The DSN/environment/PII-scrubbing config exists and is unit-tested in isolation, but
nothing is wired into the actual request or render path yet — no events can be produced.

---

## Phase 3: User Story 1 - Unhandled errors are visible without a user report (P1) 🎯 MVP

**Goal**: An unhandled error anywhere in production (client or server) automatically produces an
issue in FlightDeck within minutes, with no PII, and never alters the response/behavior the user
actually sees.

- [X] T008 [US1] Extend `src/server/index.ts`: wrap the existing `export default { fetch, scheduled }
      satisfies ExportedHandler<Env>` in `Sentry.withSentry(env =>
      buildServerMonitoringConfig(env), { fetch, scheduled })` (T004) — the existing `fetch`/
      `scheduled` bodies are otherwise unchanged (FR-002, FR-007)
- [X] T009 [US1] Extend `src/client/main.tsx`: call `Sentry.init(buildClientMonitoringConfig())`
      (T005, from `src/client/monitoring.ts`) before `createRoot(rootElement).render(...)` (FR-001)
- [ ] T010 [US1] Live-verify (quickstart.md steps 1-4): a deliberate server-side error produces a
      FlightDeck issue with a readable stack trace and no `Cookie`/`Authorization` header or request
      body attached; a deliberate client-side error does the same; pointing the DSN at an
      unreachable host and repeating the server case confirms the API response is unaffected (FR-007)

**Checkpoint**: The core promise of this feature works end to end (SC-001, SC-002, SC-003). This is
the MVP.

---

## Phase 4: User Story 2 - Errors are attributable to a specific release (P2)

**Goal**: Confirm every captured error/trace carries the exact release identifier already shown in
the app's own version display, so FlightDeck's release view correctly distinguishes issues across
deploys — no new capture mechanism, this proves T004/T005's shared `release` value is correct and
stays correct (same "verification only" shape as specs/022's later stories).

- [X] T011 [US2] Extend `tests/server/monitoring.test.ts` (T007): assert
      `buildServerMonitoringConfig(...).release` is read from `.release-please-manifest.json` via
      the same import path `src/client/version.ts` uses, as a regression guard against the two sides
      drifting to different values
- [ ] T012 [US2] Live-verify (quickstart.md step 5): the release tag on issues captured in T010
      matches `APP_VERSION` for the build under test, not a Cloudflare-internal version id; then
      bump `.release-please-manifest.json` to a second version, rebuild/redeploy, trigger a new
      error unique to this second build, and confirm FlightDeck's release view attributes it to the
      second release while the first release's issue from T010 stays attributed to the first —
      matching spec.md's own Independent Test for this story (two sequential releases, not a
      single-build tag check)

**Checkpoint**: SC-005 confirmed — issues are attributable to a specific shipped build.

---

## Phase 5: User Story 3 - Performance regressions are visible (P3)

**Goal**: A bounded sample of production request performance is visible in FlightDeck's Traces view,
with enough of a breakdown to identify which step was slow — not just a single flat duration.

- [X] T013 [US3] Extend `src/client/monitoring.ts` (T005): add `Sentry.browserTracingIntegration()`
      to the client config's `integrations` array — `tracesSampleRate` alone doesn't produce
      route/request traces without this integration enabled
- [X] T014 [US3] Confirmed against the installed package's actual source
      (`node_modules/@sentry/cloudflare/build/cjs/instrumentations/worker/instrumentEnv.js` +
      `instrumentD1.js`): `withSentry()` (T008) already wraps every binding on `env` — including
      `env.DB` — via a `Proxy`, and `instrumentD1` wraps `D1PreparedStatement.first/run/all/raw` in
      `core.startSpan(...)` automatically. Every D1 call already made through
      `src/server/db/repository.ts`'s `.prepare(...)` (the only place D1 is queried, per
      `scripts/check-repository-boundary.sh`) gets its own child span nested under the request's
      root span with no extra code — the "request handling vs. underlying data access" breakdown
      spec.md's US3 Acceptance Scenario 1 requires is automatic, not something this feature needs
      to hand-instrument
- [ ] T015 [US3] Live-verify (quickstart.md step 7): a burst of requests against a production-mode
      build produces a proportionate (not 100%) sample of traces in FlightDeck, each showing a
      duration breakdown that distinguishes request handling from data access (T014), not a single
      flat span

**Checkpoint**: All three user stories work independently and together (SC-001 through SC-005 all
verifiable).

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T016 Run `deno task check` (fmt, lint, typecheck, full test suite, repository-boundary guard)
      and fix any failures across all files touched by this feature
- [ ] T017 [P] Live-verify (quickstart.md step 6): `deno task build:preview` and repeat the T010
      error triggers against that build — confirm zero corresponding issues appear in FlightDeck
      (FR-004, SC-004)
- [ ] T018 [P] Live-verify (quickstart.md step 8): with devtools open on a production-mode build,
      confirm the CSP header includes exactly the one new `connect-src` origin from T006 and that an
      unrelated cross-origin `fetch()` is still blocked
- [ ] T019 Live-verify (quickstart.md step 9): ship through the existing
      `deploy-preview.yml`/`deploy-production.yml` pipeline unchanged (no new secret to provision —
      research.md) and repeat one error trigger against the real deployed URL
- [ ] T020 Operational check (SC-002, not a pre-merge blocker — cannot be verified until real
      production traffic exists): a few days after T019 ships to production, compare
      error/latency rates for a representative period before vs. after rollout (e.g. via Cloudflare
      Workers' own request metrics) and confirm no observable regression attributable to the
      monitoring integration itself. Record the result in the PR or a follow-up comment rather than
      blocking merge on it.

## Dependencies

- **Phase 1 (Setup)** → **Phase 2 (Foundational)**: the SDKs must be installed and the compatibility
  flag present before the config modules (which import from them) can be written.
- **Phase 2 (Foundational)** → **User Story 1 (Phase 3)**: `buildServerMonitoringConfig`/
  `buildClientMonitoringConfig` (T004/T005) must exist before anything can wrap the server export or
  call `Sentry.init` client-side.
- **User Story 1 (Phase 3)** → **User Story 2 (Phase 4)**: release attribution can only be verified
  once T010 has produced real captured issues to inspect.
- **User Story 1 (Phase 3)** → **User Story 3 (Phase 5)**: tracing builds on the same client config
  object T009 already wires into `main.tsx`.
- **Phase 6 (Polish)**: after everything else.

## Parallel execution examples

Within Phase 2, most tasks touch different files with no dependency on each other:

```text
T003 [P] vite.config.ts
T004 [P] src/server/monitoring/config.ts
T005 [P] src/client/monitoring.ts
T006 [P] src/server/security/csp.ts
```

(T007 depends on T004 existing; sequenced after.)

## Implementation strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (User Story 1).** Unhandled errors from both client and server
showing up in FlightDeck, without PII and without affecting user-facing behavior, already delivers
this feature's entire reason for existing. User Story 2 (release attribution) and User Story 3
(performance traces) round out the value on top of a mechanism Phase 3 already ships — neither
changes how errors are captured.
