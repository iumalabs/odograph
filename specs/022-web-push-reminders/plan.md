# Implementation Plan: Web Push Reminder Delivery

**Branch**: `022-web-push-reminders` | **Date**: 2026-08-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/022-web-push-reminders/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Adds web push as a second delivery channel for the same due-reminder notifications
`evaluateAllReminders` (specs/012) already sends by email, using the exact same trigger (the daily
Cron Trigger sweep) and escalation/dedup gate (`last_notified_severity`), now shared across both
channels rather than duplicated. A new `push_subscriptions` table (tenant-scoped, one row per
opted-in browser) is populated via two new session-only endpoints (subscribe/unsubscribe) and read
by the sweep to send a notification to every currently-valid subscription. Payload encryption
(RFC 8291 `aes128gcm`) and VAPID JWT signing (RFC 8292) are handled by `web-push-browser`, a
zero-dependency, Web-Crypto-only library explicitly built for Cloudflare Workers/Deno/browsers —
research.md's Decision 1 covers why this wasn't hand-rolled the way e.g. EXIF stripping was.

## Technical Context

**Language/Version**: TypeScript throughout — Hono/Workers server, Vite-built React 19 SPA client,
plus a small service worker addition.

**Primary Dependencies**: New — `web-push-browser` (zero sub-dependencies, Web Crypto API only, no
`nodejs_compat` flag needed — confirmed via its own README as explicitly Cloudflare-Workers-
targeted). No other new dependency.

**Storage**: New D1 table, `push_subscriptions` (migration `0014_push_subscriptions.sql`),
tenant-scoped. Two new Workers secrets, `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` (generated once,
`wrangler secret put`, never in `wrangler.toml` — same pattern as `GOOGLE_CLIENT_SECRET`, specs/004
research.md).

**Testing**: Server-side subscribe/unsubscribe endpoints and the extended `evaluateAllReminders`
dedup-sharing logic get full `tests/server/**` coverage under `@cloudflare/vitest-pool-workers` —
this is ordinary, fully-testable Worker logic (D1 read/write, route validation), same pattern as
specs/011/012's own reminder tests. The actual outbound push send (a real HTTPS call to a real push
service like FCM/Mozilla's) is not something a test environment can exercise — mirrors specs/012's
own precedent of testing everything *except* the literal external send call, which is verified live.
The client-side subscribe/unsubscribe flow and service worker `push`/`notificationclick` handlers
have no equivalent under this repo's `vitest.config.ts` (no real Push API, no real service worker
execution) — verified live per quickstart.md, same precedent as specs/018-021's client-only pieces.

**Target Platform**: Every browser visiting the client that supports the Push API and Notifications
API (the large majority of desktop and Android browsers; iOS Safari requires the PWA to be
home-screen-installed for push to work at all — a platform limitation, not a design choice here).
Server-side: Cloudflare Workers, same as everything else.

**Performance Goals**: None specific — bounded by the existing once-daily Cron Trigger sweep, same
as email.

**Constraints**: MUST NOT introduce a second scheduled job or a different escalation rule from
email's existing one (spec.md Assumptions — this is a new channel on an existing decision, not a
new decision). MUST NOT block or fail the email send (or vice versa) if the other channel's attempt
fails — per-channel isolation inside the same per-row `try/catch` `evaluateAllReminders` already
uses. MUST NOT expose the VAPID *private* key anywhere reachable by the client (only the public key,
via a session-authenticated endpoint).

**Scale/Scope**: 1 new migration, 1 new server module (`src/server/push/`), 1 new route file
(`src/server/routes/v1/push.ts`), `repository.ts` extended (+4 functions, `evaluateAllReminders`
extended), 1 new client module (`src/client/push.ts`), `sw.ts` extended (+2 event listeners), 1 new
UI component (`PushNotifications.tsx`, mirroring `ApiTokens.tsx`), `App.tsx` wiring, new i18n
strings, new `tests/server/push-subscriptions.test.ts`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Tenant Isolation via Repository Layer** — PASS: `push_subscriptions` is tenant-scoped
  (`tenant_id` FK), every query goes through new `repository.ts` functions keyed by `ctx.tenantId`,
  no route handler reaches D1 directly.
- **II. Server-Computed, Division-Safe Aggregates** — N/A, no aggregate math.
- **III. Idempotent, Ordered Offline Sync** — N/A, unrelated to the offline write queue (specs
  020/021) — reminder notifications are a server-scheduled push, not a client-queued write.
- **IV. No Interpolated Data** — PASS: notification content is built from the same real
  `vehicleName`/`ruleLabel`/`status` fields the email channel already uses — no new derived or
  guessed content.
- **V. Private Object Storage with Validated Uploads** — N/A, no R2/attachments involved.
- **VI. Hardened API Tokens** — PASS by exclusion: the new subscribe/unsubscribe endpoints are
  session-only (`tenantContext`, not `tenantContextOrToken`) — an API token has no service worker to
  subscribe with, so there's nothing for it to authenticate here, mirroring specs/017's own
  session-only boundary for token management and account deletion.
- **VII. Locked-Down Session and Transport Security** — PASS: subscribe/unsubscribe are rate-limited
  writes (`rateLimitBySession`) like every other write route; the VAPID private key is a Workers
  secret, never sent to or reachable by the client.
- **VIII. GDPR Erasure by Design** — decided here: `push_subscriptions` rows are **deleted**, not
  anonymised, on account erasure, via the existing `tenant_id ... ON DELETE CASCADE` mechanism
  already centralized in `deleteTenantAccount` — no new erasure code needed, same as `api_tokens`
  (specs/017) and `write_operations` (specs/020). A subscription holds no data with meaning
  independent of the erased tenant.
- **IX. Separated Language and Locale Axes; i18n from Screen One** — PASS: every new UI string routes
  through `t()`. Notification title/body text is server-generated (like the email's subject/body
  today) — specs/012 never routed *email* subject/body through the client `t()` table either (it's
  server-side content, not app UI), so this feature is consistent with that existing precedent, not
  a new exception.
- **X. Toolchain Discipline** — PASS: `web-push-browser` declared as an `npm:` specifier in
  `deno.json`, resolved via `deno install`. It runs entirely within `workerd`'s Web Crypto API and
  the browser's service worker context — never inside a Deno-runtime-only code path.
- **XI. English-Only Project Artifacts** — PASS.
- **XII. GitHub-Actions-Only Deployment** — PASS: the new migration is picked up automatically by
  the existing `deno task migrate:preview` CI step. The two new VAPID secrets must be set once via
  `wrangler secret put` (documented in quickstart.md) — a one-time manual operational step, not a
  deploy-time action, same category as the existing `GOOGLE_CLIENT_SECRET` setup.

No violations — Complexity Tracking section is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/022-web-push-reminders/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

No separate `contracts/` file: the two new endpoints are documented directly in data-model.md
alongside the table they operate on, matching how small feature-local contracts have been handled
when a dedicated file would be mostly boilerplate (data-model.md carries the exact request/response
shapes).

### Source Code (repository root)

```text
migrations/
└── 0014_push_subscriptions.sql       # new: push_subscriptions table

src/server/
├── push/
│   └── send-reminder-push.ts         # new: sendReminderPushNotification() — mirrors
│                                       #   email/reminder-notification.ts's never-throws contract
├── db/
│   └── repository.ts                 # extended: listPushSubscriptions/createOrUpdatePushSubscription/
│                                       #   deletePushSubscription/deletePushSubscriptionById;
│                                       #   evaluateAllReminders sends push alongside email, shares
│                                       #   the last_notified_severity gate across both channels
├── routes/v1/
│   └── push.ts                       # new: POST/DELETE subscription, GET vapid-public-key
│                                       #   (all session-only, rateLimitBySession on writes)
└── types.ts                          # extended: VapidSecrets ambient Env fields

src/client/
├── sw.ts                             # extended: `push` + `notificationclick` listeners
├── push.ts                           # new: isPushSupported/subscribeToPush/unsubscribeFromPush
├── components/
│   └── PushNotifications.tsx         # new: opt-in toggle, mirrors ApiTokens.tsx's shape/placement
├── i18n/strings.ts                   # extended: toggle labels, permission-denied message
└── App.tsx                           # extended: mounts PushNotifications alongside ApiTokens

tests/server/
└── push-subscriptions.test.ts        # new: subscribe/unsubscribe/list, cross-tenant isolation,
                                        #   evaluateAllReminders sending push alongside email
```

**Structure Decision**: Single-project web app (existing structure). Server additions follow the
existing `email/` → `push/` module-naming parallel exactly; client additions follow the existing
`offline/` module-per-concern pattern from specs/020.
