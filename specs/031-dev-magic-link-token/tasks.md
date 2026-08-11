# Tasks: Dev-Only Magic-Link Token Retrieval Endpoint

**Input**: Design documents from `/specs/031-dev-magic-link-token/` **Prerequisites**: plan.md,
spec.md, research.md, data-model.md, contracts/api.md, quickstart.md

**Tests**: Included — this is a small, security-relevant surface (production-inertness matters),
and the project already has an established test pattern for exactly this shape of route
(`tests/server/dev-routes-production-gating.test.ts`).

## Phase 1: Setup

None — no new dependency, no new migration.

## Phase 2: Foundational (blocking prerequisites)

**⚠️ No user story work may start until this phase is complete.**

- [X] T001 In `src/server/auth/dev-session.ts`, change `const notFoundOutsideDev = ...` to
      `export const notFoundOutsideDev = ...` (research.md — reuse, don't duplicate, the
      production-inertness middleware)

**Checkpoint**: `notFoundOutsideDev` is importable from `dev-session.ts`; nothing else changed yet.

---

## Phase 3: User Story 1 - An automated test completes a magic-link sign-in without a real inbox (Priority: P1) 🎯 MVP

**Goal**: The new endpoint exists, returns a pending token when one exists, and clearly indicates
when none does.

- [X] T002 [US1] Create `src/server/auth/dev-magic-link.ts`: `export const devMagicLink = new
      Hono<AppEnv>()`; `GET /` behind the imported `notFoundOutsideDev` (from `./dev-session`),
      reading `c.req.query("email")`, calling `findMagicLinkTokenByEmail(c.env.DB, email ?? "")`
      (a missing/empty email naturally finds no row, satisfying the "malformed email → same as
      not-found" edge case without special-casing it), and returning `c.json({ token: row?.token ??
      null, expiresAt: row?.expiresAt ?? null })` — always `200`, per contracts/api.md
- [X] T003 [US1] Wire `devMagicLink` into `src/server/index.ts` under
      `/api/v1/_dev/magic-link-token` (import alongside the existing `devSession` import,
      `app.route("/api/v1/_dev/magic-link-token", devMagicLink)` near
      `app.route("/api/v1/_dev/session", devSession)`)
- [X] T004 [P] [US1] Create `tests/server/dev-magic-link.test.ts`: 1. Request a magic link for an
      email (via the real `/api/v1/auth/magic-link/request` route through `SELF.fetch`), then
      confirm `GET /api/v1/_dev/magic-link-token?email=...` returns a `token`/`expiresAt` pair. 2.
      Confirm that returned token successfully completes sign-in via the real
      `GET /api/v1/auth/magic-link/verify?token=...` route (proves FR-006 — the retrieved token is
      genuinely usable, not just shaped correctly). 3. Confirm an email that never requested a link
      returns `{ token: null, expiresAt: null }`, status `200`. 4. Confirm a request with no
      `email` query param at all also returns `{ token: null, expiresAt: null }`, status `200`
      (FR-002, spec.md edge case)

**Checkpoint**: `deno task test` passes for the new route's happy-path and not-found behavior; a
retrieved token demonstrably completes real sign-in.

---

## Phase 4: User Story 2 - The endpoint does not exist in production (Priority: P1)

**Goal**: Confirm zero production footprint, mirroring the existing test pattern exactly.

- [X] T005 [US2] Extend `tests/server/dev-routes-production-gating.test.ts`'s existing
      `describe` block with a third case: `GET /api/v1/_dev/magic-link-token` (with or without an
      `email` query param) returns `404` when `ENVIRONMENT` is overridden to `"production"` in the
      env object passed to `app.fetch` — same pattern as the file's existing two cases for
      `POST /_dev/session` and `POST /_dev/session/invalidate`

**Checkpoint**: `deno task test` passes; the new route is proven inert in production by the same
mechanism already trusted for the two existing dev-only routes.

---

## Phase 5: Polish & Cross-Cutting

- [X] T006 Run `deno task check` (fmt, lint, typecheck, test, build, repository-boundary guard) and
      fix any failures across all files touched by this feature
- [X] T007 Walk through quickstart.md's three validation scenarios end-to-end against
      `deno task dev` (scenario 3 is satisfied by T005's test, not a manual step, since production
      config isn't available in local dev — quickstart.md already notes this)

## Dependencies

- **Phase 2 (Foundational)** → **all user story phases**: strict — `notFoundOutsideDev` must be
  exported before the new route can import it.
- **User Story 1 (Phase 3)** → **User Story 2 (Phase 4)**: soft — Phase 4 needs the route to exist
  to test its production behavior, but the two stories test genuinely independent concerns
  (functionality vs. inertness) and could be reordered if needed.
- **Phase 5 (Polish)**: after everything else.

## Implementation strategy

**MVP = Phase 2 + Phase 3 (User Story 1).** That delivers the actual retrieval capability — this
feature's entire point. User Story 2 (Phase 4) is the equally-mandatory safety proof that this
capability doesn't leak into production, using an already-established, already-trusted test
pattern rather than inventing a new one.
