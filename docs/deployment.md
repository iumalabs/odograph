# Deployment

All deploys happen through GitHub Actions (constitution Principle XII). There is no supported local
`wrangler deploy`/`wrangler versions upload` path to preview or production — `wrangler dev` for
local iteration is fine, changing Cloudflare's live state for a shared environment from a laptop is
not.

## Cloudflare account

- Account: **Max Yugai** (`8b655d0dde6d223b9ce11116a014973a`)
- Zone: `odograph.dev` (already active in the account)

## Environments

|              | Preview                                                                                                                                                                                                                | Production                                                                                   |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Trigger      | every pull request (opened/synchronized)                                                                                                                                                                               | pushing a `v<major>.<minor>.<patch>` tag — **not** every push to `main` (see Releases below) |
| Mechanism    | `wrangler versions upload` — a new Version of the one `odograph-preview` Worker, never promoted to serve default traffic                                                                                               | `wrangler deploy`                                                                            |
| Worker name  | `odograph-preview` (same Worker for every PR — only the Version differs)                                                                                                                                               | `odograph`                                                                                   |
| URL          | `https://pr-<PR number>-odograph-preview.kgz.workers.dev` (`--preview-alias`, stable across every push to the same PR)                                                                                                 | `https://odograph.dev`                                                                       |
| D1 / R2 / KV | dedicated `-preview` resources, shared across all open PRs                                                                                                                                                             | dedicated production resources                                                               |
| Lifecycle    | uploaded on PR open, re-uploaded (same alias, new Version) on every push — **no teardown on PR close**: nothing separate exists to delete, so the alias keeps serving whatever Version was last uploaded, indefinitely | long-lived                                                                                   |

Preview intentionally shares one set of D1/R2/KV resources across all open PRs (not one set per PR)
to keep the Cloudflare footprint bounded; it is a smoke-test environment, not an isolated data
sandbox. If a PR needs isolated data to test destructive migrations, say so in the PR description
and coordinate manually rather than assuming isolation.

**Trade-off accepted going with Worker Versions over one named Worker per PR**: non-versioned config
(routes, Cron Triggers, `logpush`) only takes effect for whatever Version is actually promoted via
`wrangler versions deploy` — which nothing in the preview pipeline calls, so a PR's preview Version
never gets its own live Cron firing. This project doesn't rely on that in practice: every
scheduled-handler test uses `createScheduledController()` directly (see
`specs/011-reminder-rules-cron/quickstart.md`), and there's no HTTP route to manually trigger a
sweep in _any_ environment — preview or production. If a future feature ever needs to watch a real
Cron fire against in-review code, that's a real gap worth revisiting then, not a blocker now.

Production uses the custom domain `odograph.dev` via a Cloudflare custom domain / route binding,
configured in `wrangler.toml` under `[env.production]`.

## Releases

Production deploys are tag-triggered (`deploy-production.yml` matches `v[0-9]*.[0-9]*.[0-9]*`), not
tied to every push to `main` — merging a PR ships it to `main` and to the next PR's preview, but not
to `odograph.dev` until a release tag actually gets pushed. This decouples "code is on `main`" from
"code is live," matching the same reasoning that moved e2e off the PR-blocking path (issue #89): a
bounded, predictable release cadence instead of every single merge being its own production event.

`.github/workflows/release.yml` cuts that tag automatically, once daily (`0 2 * * *` UTC) plus
on-demand via `workflow_dispatch`:

1. Finds the latest `v*.*.*` tag and diffs `main` against it. No new commits since → no-op that day.
2. Scans the commit messages since that tag for a version bump signal,
   [Conventional Commits](https://www.conventionalcommits.org/)-style: a `!` before the colon
   (`feat!:`) or a `BREAKING CHANGE` footer anywhere → **major**; a `feat:`/`feat(scope):` subject
   with no breaking marker → **minor**; anything else (`fix:`, `docs:`, `ci:`, unlabeled, ...) →
   **patch**. This project's actual commit history already follows `feat:`/`fix:`/etc. prefixes
   consistently (not formally mandated, but the de facto style — see recent `git log`), so this
   reads real signal, not noise.
3. Creates a GitHub Release at the bumped version
   (`gh release create vX.Y.Z --generate-notes
   --target main`), which both creates and pushes the
   tag — triggering `deploy-production.yml`.

`v1.0.0` was cut manually as the first release (nothing to diff against yet); every release since
follows the automated path above. To force an off-cycle release without waiting for the next
`02:00 UTC` run, use `workflow_dispatch` on `release.yml` from the Actions tab — there is no
supported way to push a release tag by hand outside this workflow (same "no local deploy path"
reasoning as everything else in this document).

## Required GitHub configuration

Two
[GitHub Environments](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment)
back the workflows: `preview` and `production`, mainly to scope each environment's own
`CLOUDFLARE_API_TOKEN` secret (see below) — neither currently has a manual-approval protection rule.
`production` deploys automatically whenever `release.yml` pushes a release tag (see Releases above);
the `required_reviewers` rule was removed 2026-08-12, once the team's actual practice — self-merging
PRs once CI is green, plus the bounded daily release cadence replacing per-merge deploys — made a
second manual click before deploy redundant rather than protective (a `branch_policy` rule
restricting deployments to `main` is still in place). `preview` has no protection rule either — see
the fork-PR guard below for why that's still safe.

Repository/environment configuration:

| Name                    | Kind                                             | Used by                                                      | Notes                                                                                |
| ----------------------- | ------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `CLOUDFLARE_API_TOKEN`  | **environment secret**, `preview` environment    | `deploy-preview.yml` (declares `environment: preview`)       | scoped token, see permissions below — account-level only, no zone access             |
| `CLOUDFLARE_API_TOKEN`  | **environment secret**, `production` environment | `deploy-production.yml` (declares `environment: production`) | scoped token, see permissions below — account-level + `odograph.dev` zone            |
| `CLOUDFLARE_ACCOUNT_ID` | repository variable (`gh variable set`)          | both workflows                                               | `8b655d0dde6d223b9ce11116a014973a` — not sensitive, so it's a variable, not a secret |

**Same secret name, two different values, scoped per
[GitHub Environment](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment).**
Both `deploy-preview.yml` (every same-repo PR) and `deploy-production.yml` (every release tag) run
fully unattended now — neither has a manual approval gate. The environment split still matters for
secret scoping: giving the preview path a credential that can also edit the production zone's
DNS/routes would be a needless blast-radius increase — a bug in the preview deploy step, or a
compromised dependency in that job, would otherwise be able to reach production infrastructure it
has no legitimate reason to touch. A job only sees the secret for the environment it declares
(`environment: preview` / `environment: production`).

### `preview` environment `CLOUDFLARE_API_TOKEN` permissions

Account resources only (account `8b655d0dde6d223b9ce11116a014973a`) — no zone resources at all,
since preview never touches a custom domain:

| Permission         | Level |
| ------------------ | ----- |
| Workers Scripts    | Edit  |
| Workers KV Storage | Edit  |
| Workers R2 Storage | Edit  |
| D1                 | Edit  |
| Account Settings   | Read  |

### `production` environment `CLOUDFLARE_API_TOKEN` permissions

Same account resources as above, **plus** one zone resource (zone `odograph.dev`) — required because
the production route uses `custom_domain = true` in `wrangler.toml`:

| Permission     | Level |
| -------------- | ----- |
| Workers Routes | Edit  |

Generate both via the Cloudflare dashboard's "Connect to Git"/GitHub Actions token flow for this
Worker rather than a hand-built custom token — it derives the exact permission set (including the
zone permission above) from the Worker's actual bindings and routes, which is how these two tokens
were created. It may also include `Queues:Edit` as part of its standard Workers template; harmless
since the project has no queues (constitution: Cloudflare Queues is explicitly out), not worth
trimming by hand.

Set/update either one from the repo's Settings → Environments → _preview_ or _production_ →
Environment secrets — never paste a token into chat or commit one anywhere.

**Fork PRs never get an auto-deployed preview.** `deploy-preview.yml` gates on
`github.event.pull_request.head.repo.full_name == github.repository`, so a pull request from a fork
can't reach the `preview` environment's `CLOUDFLARE_API_TOKEN`. `ci.yml` still runs (and is the
required check) for fork PRs — they just don't get a live preview URL until the project has a real
external-contributor trust process.

## Workflows

- `.github/workflows/ci.yml` — format/lint/typecheck/test/build on every push and PR. Required check
  before merge. Deliberately does **not** run the e2e suite (see `e2e.yml` below) — issue #89's
  investigation found the suite's own healthy runtime (~2-3 min) plus its nonzero residual flake
  rate made it a worse PR-blocking gate than a scheduled one.
- `.github/workflows/e2e.yml` — the Playwright + client-coverage-gate suite, on a daily schedule
  (`0 3 * * *` UTC) plus manual `workflow_dispatch`, not on `pull_request` or `push`. Decoupled from
  any single PR/merge on purpose (see the workflow file's own comment) — catches regressions within
  a bounded window without making every push a coin flip on an unrelated flake.
- `.github/workflows/deploy-preview.yml` — re-runs `ci.yml`'s checks, applies any pending D1
  migrations to `odograph-preview` (idempotent), then uploads the PR head commit as a new Worker
  Version of `odograph-preview` (never promoted) and comments the stable per-PR preview URL on the
  PR. Same-repo PRs only. No separate cleanup workflow — there's no per-PR resource to tear down.
- `.github/workflows/release.yml` — daily (`0 2 * * *` UTC) plus manual `workflow_dispatch`; cuts an
  automated semver release tag from `main` if there are new commits since the last one (see Releases
  above). Pushing that tag is what triggers `deploy-production.yml` — this workflow itself never
  touches Cloudflare.
- `.github/workflows/deploy-production.yml` — triggered by a `v*.*.*` tag push (from `release.yml`,
  or `v1.0.0`'s one-time manual creation), re-runs `ci.yml`'s checks, applies any pending D1
  migrations to `odograph-production` (idempotent), then deploys the tagged commit to the
  `production` environment. Runs unattended — no manual approval gate (see above).

Migrations only ever apply through the two deploy workflows — never run
`wrangler d1 migrations apply --remote` from a local machine, for the same reason there's no local
`wrangler deploy` path (constitution Principle XII).

See each workflow file for the exact steps; this document describes intent and stays in sync with
them manually — if you change a workflow's trigger or target, update this table in the same PR.
