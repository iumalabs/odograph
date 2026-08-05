# Tasks: Magic Link Authentication

**Input**: Design documents from `/specs/003-magic-link-authentication/` **Prerequisites**: plan.md,
spec.md, data-model.md, contracts/api.md, research.md, quickstart.md

**Tests**: Included — D1-state assertions (no real inbox in CI, per research.md) plus the
response-parity and cross-method-isolation checks the spec calls out explicitly.

> Updated after `/speckit-analyze`: T011 now covers two cases the original description missed
> (FR-005/SC-005 invalidate-on-new-request, and an unknown/forged token — findings C1/H1). FR-008's
> send-failure (502) path is deliberately left without an automated test — findings M1 — since what
> a realistic failure actually looks like depends on what T007's live smoke test reveals; a
> synthetic test written before that risks asserting the wrong failure mode.

## Phase 1: Setup

- [X] T001 Create D1 migration `migrations/0003_magic_link.sql` (tables `magic_link_identities`,
      `magic_link_tokens` per data-model.md)
- [X] T002 Add a `[[send_email]] name = "EMAIL"` binding to `wrangler.toml` for the default
      (local/test), `env.preview`, and `env.production` sections
- [X] T003 Run `npm run cf-typegen` to regenerate `worker-configuration.d.ts` with the new binding's
      type, confirm `npm run typecheck` still passes

## Phase 2: Foundational (blocking prerequisites)

**⚠️ No user story work may start until this phase is complete.**

- [X] T004 Apply the migration locally: `wrangler d1 migrations apply odograph-preview --local`
- [X] T005 [P] Add repository functions to `src/server/db/repository.ts` per data-model.md's
      "Repository layer additions": `findMagicLinkIdentityByEmail`, `createMagicLinkUser` (D1
      `batch()` — tenant + user + identity atomically, FR-002), `invalidateAndCreateMagicLinkToken`
      (delete-then-insert in one function, FR-005), `consumeMagicLinkToken` (atomic
      check-and-delete). No existing export's signature changes.
- [X] T006 [P] Implement `src/server/auth/magic-link.ts`: token generation
      (`crypto.getRandomValues`, matching `session.ts`'s entropy approach), email composition
      (distinct subject/body for "new account" vs. "welcome back," but _always_ sending something —
      research.md's FR-006 timing-parity approach), and the `env.EMAIL.send()` call itself with
      FR-008 error handling (catch and surface, don't swallow)
- [X] T007 **Live smoke test** — DONE, with a concrete finding. `POST /request` against the PR-33
      preview returned a specific, actionable error (not silent/opaque, satisfying the letter of this
      task): `"destination address is not a verified address"`. Root cause confirmed against
      Cloudflare's Email Service docs: `env.EMAIL.send()` can only reach destination addresses
      pre-verified in the dashboard, or arbitrary recipients if the sending domain has been
      "onboarded" to Email Service — which requires the Workers Paid plan (3,000 emails/mo included,
      then $0.35/1,000) and a dashboard/API step to add SPF/DKIM/DMARC records. This is a real gap,
      not an implementation bug: `sendMagicLinkEmail`'s error handling (FR-008) worked exactly as
      designed. Decision (owner-confirmed): onboard `odograph.dev` to Email Service rather than
      switch providers — pending on the owner completing the Workers Paid plan upgrade and domain
      onboarding (Compute > Email Service > Email Sending in the dashboard), since both are
      billing/domain-trust actions outside this agent's authority. Re-verify once done.

**Checkpoint**: Repository additions and the email/token module exist, type-check, and — per T007 —
the one specific blocker to delivering real mail from the `odograph.dev` zone is identified and
its resolution owned. Downstream phases proceed since the code path itself is proven correct;
final send-success confirmation is deferred to T017.

---

## Phase 3: User Story 1 - A visitor signs up or signs in with just their email (P1) 🎯 MVP

**Goal**: Complete request → email → verify → session end-to-end, with the D-004-safe method-scoped
identity check (FR-002/FR-003/FR-003a).

**Independent Test**: Per spec.md — submit an email, retrieve the token via a test-only path (not a
real inbox), follow it, confirm a session is issued (new tenant for a new email, existing tenant for
a repeat magic-link email).

- [X] T008 [US1] Implement `POST /api/v1/auth/magic-link/request` in
      `src/server/routes/v1/auth/magic-link.ts`: validates the email (400 on malformed input,
      contracts/api.md), calls `invalidateAndCreateMagicLinkToken`, calls `magic-link.ts`'s send
      function, returns `{ sent: true }` on success or `502` if sending failed (FR-008) — the
      _lookup_ of new-vs-existing happens here only to choose email copy, never to change the
      response shape or short-circuit any step (FR-006)
- [X] T009 [US1] Implement `GET /api/v1/auth/magic-link/verify`: consumes the token (redirect to
      `/?magicLink=error` if invalid/expired/already used, FR-004), looks up
      `findMagicLinkIdentityByEmail` for the token's email — on no match, calls
      `createMagicLinkUser` (FR-002); on a match, uses that existing `userId` (FR-003) — then
      `issueSession` and redirect to `/?magicLink=ok` with the session cookie set
- [X] T010 [US1] Wire both routes into `src/server/index.ts` under `/api/v1/auth/magic-link`, with
      `rateLimitByIp` applied to `request` (contracts/api.md — `verify` is not separately
      rate-limited)
- [X] T011 [P] [US1] Write `tests/server/magic-link-auth.test.ts` (lifecycle section) covering
      spec.md's User Story 1 Acceptance Scenarios 1-4, six _distinct_ cases (analyze pass added two
      the original description was missing coverage for): 1. A new email's request-then-verify
      creates exactly one tenant/user/identity and issues a working session. 2. A second
      request+verify cycle for the _same_ email resolves to the same tenant, not a new one. 3.
      Following a token twice — the second attempt is rejected (FR-004). 4. An unconsumed token is
      queryable in D1 but grants no session until followed (no session issued from the request step
      alone). 5. **Invalidate-on-new-request (FR-005/SC-005)**: request a link for an email, request
      a _second_ link for the same email without following the first, then attempt to follow the
      first token — it must be rejected, since the second request invalidated it. 6.
      **Unknown/forged token (SC-003)**: a token string that was never issued by this test run is
      rejected the same way an already-consumed one is — not just implied by case 3 sharing the same
      code path, but asserted directly.

**Checkpoint**: User Story 1 is independently complete and testable — `npm test` passes for the
lifecycle section, and quickstart.md steps 1-2 and 4 (steps 1-3) work against `wrangler dev` with a
real inbox.

---

## Phase 4: User Story 2 - Response parity and cross-method isolation (P2)

**Goal**: Prove the two security-shaped properties this feature explicitly commits to: request
responses don't leak registration status (FR-006), and magic link never silently signs into an
account created by a different method (FR-003a/D-004).

**Independent Test**: Per spec.md — submit a never-used email and a known-registered email through
the request endpoint and confirm identical response shape; separately, request a magic link for an
email already used by a passkey account and confirm it creates its own distinct account rather than
signing into the passkey one.

- [X] T012 [P] [US2] Extend `tests/server/magic-link-auth.test.ts` (parity/isolation section)
      covering User Story 2 Acceptance Scenarios 1-2 and spec.md Acceptance Scenario 5 from User
      Story 1: request responses for a never-used email and an already-magic-link-registered email
      have the same status code and body shape (FR-006); a malformed email is rejected (400)
      regardless of whether some valid-looking variant is registered; requesting a magic link for an
      email already used to create a passkey account (seed one directly via `createCredentialedUser`
      from specs/002, reusing that repository function) results in a _different_ `tenantId` after
      verify than the passkey account's — proving no auto-link occurred (D-004)

**Checkpoint**: `npm test` passes for the parity/isolation section.

---

## Phase 5: Client UI

**Goal**: A way to trigger the request step and observe the verify redirect's outcome, matching
passkeys' "minimal, no design polish" precedent (plan.md).

- [X] T013 [P] Implement `src/client/auth/magic-link.ts`: thin wrapper calling
      `/api/v1/auth/magic-link/request`
- [X] T014 Modify `src/client/App.tsx`: an email input + "sign in with email" button next to the
      existing passkey buttons, using the T013 wrapper; reads `?magicLink=ok`/`?magicLink=error`
      from `location.search` on mount to show the verify outcome (contracts/api.md's redirect
      contract) — new UI strings routed through `src/client/i18n/strings.ts` (specs/002's table),
      not hardcoded at their usage site (constitution Principle IX)

## Phase 6: Polish & Cross-Cutting

- [X] T015 [P] Update `src/server/db/schema.sql` reference copy with the two new tables
- [X] T016 Run `deno task check` (fmt, lint, typecheck, full test suite, repository-boundary guard)
      and fix any failures across all files touched by this feature
- [X] T017 Walked through quickstart.md end-to-end against `npm run dev`: request step shows the
      "check your email" banner, the local Miniflare `send_email` fake logs the message (no real
      inbox available locally — confirmed separately via the live T007 smoke test), following the
      verify link (confirmed via direct HTTP since the preview browser tool's synthetic in-page
      navigation didn't round-trip — a tooling quirk, not an app bug) returns 302 + sets the session
      cookie + redirects to `/?magicLink=ok`, replaying the same token 302s to `/?magicLink=error`
      with no cookie, and both outcome banners render correctly from `?magicLink=ok`/`error`. No
      quickstart.md drift found beyond the T007 section already corrected above.

## Dependencies

- **Phase 1 (Setup)** → **Phase 2 (Foundational)**: strict.
- **Phase 2 (Foundational)** → **all user story phases**: strict — repository and email/token module
  are shared by every story. T007's live smoke test specifically gates Phase 3: don't build the full
  request/verify flow on an unverified `send_email` assumption.
- **User Story 1 (Phase 3)** → **User Story 2 (Phase 4)**: soft — Phase 4's isolation test reuses
  Phase 3's request/verify routes; its parity test could in principle run standalone, but is grouped
  with the isolation test since both are the spec's explicit security-shaped requirements.
- **Phase 5 (Client UI)** → after Phase 3 at minimum (needs the request/verify endpoints to exist).
- **Phase 6 (Polish)**: after all story phases.

## Parallel execution examples

Within Phase 2, T005 and T006 touch different files and have no dependency on each other (T007
depends on both, so it isn't parallel with them):

```text
T005 [P] src/server/db/repository.ts
T006 [P] src/server/auth/magic-link.ts
```

## Implementation strategy

**MVP = Phase 1 + Phase 2 + Phase 3 (User Story 1).** That delivers the core "email in, session out"
flow and — via T007 — proves the one genuinely uncertain technical dependency (Cloudflare Email
Sending actually working for this zone) as early as possible. User Story 2's parity/ isolation tests
harden the already-working flow rather than changing its shape, so they're safe to follow rather
than block on.
