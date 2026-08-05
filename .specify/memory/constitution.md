<!--
Sync Impact Report
Version change: 1.0.0 → 1.1.0
Modified principles: X. Toolchain Discipline — Deno is now the project's package manager and
  task runner (dependencies, including Wrangler, declared as `npm:` specifiers in `deno.json`,
  no `package.json`), replacing the prior "Wrangler stays npm-based (via npm, not Deno)" claim.
  The core constraint — Deno MUST NOT be a source of runtime APIs inside Worker code — is
  unchanged.
Added sections: none
Removed sections: none
Deferred / TODO placeholders: none
-->

# Odograph Constitution

## Core Principles

### I. Tenant Isolation via Repository Layer
Tenant isolation MUST be enforced in a repository layer that injects `tenant_id`
from the session. Route handlers MUST NOT reach the database directly — every
query goes through the repository layer. No endpoint may accept an owner id as
an authorization claim from the client; the server resolves ownership from the
session, and the client only ever names the resource it wants (e.g. a vehicle
id), never who owns it.
**Rationale**: This is a multi-tenant system (see D-001); a single missed
`WHERE tenant_id = ?` is a cross-tenant data leak, so isolation must be
structural, not a convention handlers are trusted to remember.

### II. Server-Computed, Division-Safe Aggregates
All aggregates (fuel economy, cost-per-distance, cost-per-time, etc.) MUST be
computed server-side, never client-side. Every interval denominator MUST be
guarded for zero — not just null — before dividing.
**Rationale**: `Infinity`/`NaN` serialize to `null` over JSON and silently
crash client-side formatters; a zero-distance or zero-day interval is a normal
occurrence (e.g. two fuel-ups on the same day) and must degrade to "not
enough data," never to a runtime error.

### III. Idempotent, Ordered Offline Sync
Every write from the offline queue MUST carry a client-generated UUID used as
an idempotency key. Operations for a given vehicle MUST apply in creation
order. Operations the server rejects MUST surface in a user-facing review
screen — never fail silently or get dropped.
**Rationale**: The PWA offline write queue (D-002) can replay the same
operation more than once (retries, duplicate sync attempts) and can apply
operations out of network-arrival order; correctness depends on idempotency
and ordering being enforced by contract, not by client discipline.

### IV. No Interpolated Data
The system MUST NOT interpolate or invent missing data (e.g. estimating a
skipped fuel-up, or backfilling a missing odometer reading). Imperfect input
MUST produce visibly imperfect aggregates (partial, flagged, or omitted
figures), never a guessed number presented as fact.
**Rationale**: A maintenance and fuel log is a record of truth the owner may
rely on for warranty, resale, or diagnostics; a plausible-looking guess is
worse than a visible gap.

### V. Private Object Storage with Validated Uploads
R2 objects MUST NOT be public. Every read MUST go through an authenticated
Worker route that performs an ownership check. Every upload MUST be validated
by magic bytes, a size cap, and a content-type allowlist; EXIF/GPS metadata
MUST be stripped before the object is stored.
**Rationale**: Attachments (photos of receipts, odometers, damage) are
tenant-owned personal data; a public bucket or unvalidated upload path is
both a data leak and an injection vector, and GPS-tagged photos leak the
vehicle owner's home address.

### VI. Hardened API Tokens
API tokens MUST be hashed at rest, scoped to specific capabilities, revocable
by the owner, and MUST record a last-used timestamp.
**Rationale**: A leaked plaintext or unscoped token is a full-account
compromise; last-used timestamps are the only way an owner can detect
unauthorized use.

### VII. Locked-Down Session and Transport Security
The application MUST serve a strict Content-Security-Policy using nonces.
Session cookies MUST be `HttpOnly`, `Secure`, and `SameSite=Lax`. Rate
limiting MUST apply to authentication endpoints and to every write path.
**Rationale**: These are baseline defenses against XSS, session theft, and
credential-stuffing/brute-force abuse; they are cheap to get right from the
start and expensive to retrofit.

### VIII. GDPR Erasure by Design
Every table and every R2 key prefix keyed by tenant or user MUST have a
documented delete-vs-anonymise decision before the feature that populates it
ships. "We'll figure out erasure later" is not an acceptable state for any
schema change.
**Rationale**: Retrofitting erasure across a live schema is far more
expensive and error-prone than deciding it at design time, and this is a
multi-tenant SaaS product subject to GDPR erasure requests.

### IX. Separated Language and Locale Axes; i18n from Screen One
Interface language (what language the UI text is in) and vehicle/data locale
(units, date formats, currency) are separate axes and MUST NOT share one
setting. No user-facing string may be hardcoded at its usage site — all
strings route through i18n infrastructure from the first screen built, even
though v1 ships English UI strings only.
**Rationale**: Conflating "what language do you read" with "what units does
your vehicle use" breaks for real users (e.g. an English-reading owner of a
vehicle registered with metric units); retrofitting i18n after strings are
scattered inline is a large, error-prone rewrite.

### X. Toolchain Discipline
`deno fmt` MUST pass; it runs in pre-commit and in CI. Deno is the project's
package manager and task runner — every dependency, including Wrangler, is
declared as an `npm:` specifier in `deno.json` and resolved via
`deno install`; there is no `package.json`. Deno MUST NOT be used as a
source of runtime APIs inside Worker code, which targets `workerd` — Deno
resolves and runs tooling during development, build, and CI only, never
inside the deployed Worker.
**Rationale**: Mixing Deno-runtime APIs into code that executes in `workerd`
produces code that only works in one of the two environments and breaks in
the other, often in ways that only surface in production.

### XI. English-Only Project Artifacts
All AI-generated project outputs — code, comments, docs, specs, commit
messages — MUST be in English, regardless of the language used to discuss
the work in conversation.
**Rationale**: The project is open source with an international contributor
and user base; mixed-language artifacts fragment searchability and
onboarding.

### XII. GitHub-Actions-Only Deployment
Deploys to any Cloudflare environment MUST happen only via GitHub Actions —
no local `wrangler deploy` to preview or production. Every pull request gets
an isolated Cloudflare preview deployment; merges to `main` deploy to
production.
**Rationale**: A deploy that only exists as a step in CI is reproducible,
auditable (who merged what, when), and impossible to accidentally run
against the wrong account/environment from a developer's machine.

## Additional Constraints

**Locked product decisions** (see `docs/decisions/` for full rationale where
applicable):
- **D-001 Multi-tenant core.** Self-hosting is a deployment of the
  multi-tenant system with a single tenant, not a separate code path.
- **D-002 v1 scope.** Vehicles, service records, fuel records, reminders,
  dashboard, PWA with camera photo capture, and a full offline write queue.
- **D-003 Auth v1.** Passkeys are the primary method; magic link via
  Cloudflare Email Sending; one OIDC provider (Google) at launch, with more
  providers addable later via configuration.
- **D-004 No email-based account auto-linking.** Accounts are never
  auto-linked by matching email address. Linking a second sign-in method to
  an existing account requires an already-authenticated session.
- **D-005 Semantic duplicates are soft-flagged, never auto-merged.** When the
  same real-world event arrives under different client UUIDs, the system
  flags it, stores both records, and excludes the flagged entries from
  aggregates until the user resolves them. Never silently merge or drop.
- **Reminder channels (v1).** Email and web push. No generic outbound
  webhook in v1.
- **Interface language (v1).** English only, fully routed through the i18n
  layer required by Principle IX, so additional languages can be added
  later without a string-extraction rewrite.

**Technology stack:**
- Runtime: Cloudflare Workers (`workerd`).
- API: Hono, versioned under `/api/v1`.
- Client: React SPA (Vite), served via Workers Static Assets, built as a PWA.
- Data: D1 (relational), R2 (attachments), KV (sessions / settings cache).
- Scheduled work: Cron Triggers only. Cloudflare Queues MUST NOT be used.
- E2E testing: Playwright.

## Development Workflow

All feature work goes through the full Spec Kit cycle, in order:
`/speckit-specify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-analyze`
→ `/speckit-implement`. `/speckit-analyze` is a **mandatory gate** before
`/speckit-implement` — for every feature, for the life of the project, not
just the first one.

**Exempt from the full cycle** (may be committed directly, without a spec):
dependency bumps, formatting-only changes, docs/README edits, CI
configuration, and bugfixes that change no behavior described in an existing
spec. Any change that alters product behavior requires a spec first, however
small the change looks.

**Slicing**: features MUST be sliced small enough that a single
`/speckit-implement` run produces one reviewable pull request.

**Review standard**: tests passing is evidence the code does what the tests
assert, not evidence the product semantics are correct. Every PR MUST be
reviewed against the spec's intent, not only against its checklist.

**Branching**: work happens on branches cut from a freshly-fetched
`origin/main`; nobody merges their own pull request into `main`.

## Governance

This constitution supersedes ad hoc conventions and prior undocumented
practice. Amendments require an explicit changelog entry in the amended
constitution (what changed and why) and a version bump following semantic
versioning applied to this document:
- **MAJOR**: backward-incompatible principle removal or redefinition.
- **MINOR**: a new principle or section is added, or existing guidance is
  materially expanded.
- **PATCH**: clarification, wording, or non-semantic refinement.

Every PR MUST be checked for compliance with the principles above before
merge; a PR that knowingly violates a principle MUST say so explicitly in
its description with a justification, not violate it silently. Complexity
that isn't justified by one of the locked decisions or principles above
should be simplified rather than merged.

**Version**: 1.1.0 | **Ratified**: 2026-08-05 | **Last Amended**: 2026-08-05
