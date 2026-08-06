# Deployment

All deploys happen through GitHub Actions (constitution Principle XII). There is no supported local
`wrangler deploy`/`wrangler versions upload` path to preview or production — `wrangler dev` for
local iteration is fine, changing Cloudflare's live state for a shared environment from a laptop is
not.

## Cloudflare account

- Account: **Max Yugai** (`8b655d0dde6d223b9ce11116a014973a`)
- Zone: `odograph.dev` (already active in the account)

## Environments

|              | Preview                                                                                                                                                                                                                | Production                     |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Trigger      | every pull request (opened/synchronized)                                                                                                                                                                               | push to `main`                 |
| Mechanism    | `wrangler versions upload` — a new Version of the one `odograph-preview` Worker, never promoted to serve default traffic                                                                                               | `wrangler deploy`              |
| Worker name  | `odograph-preview` (same Worker for every PR — only the Version differs)                                                                                                                                               | `odograph`                     |
| URL          | `https://pr-<PR number>-odograph-preview.kgz.workers.dev` (`--preview-alias`, stable across every push to the same PR)                                                                                                 | `https://odograph.dev`         |
| D1 / R2 / KV | dedicated `-preview` resources, shared across all open PRs                                                                                                                                                             | dedicated production resources |
| Lifecycle    | uploaded on PR open, re-uploaded (same alias, new Version) on every push — **no teardown on PR close**: nothing separate exists to delete, so the alias keeps serving whatever Version was last uploaded, indefinitely | long-lived                     |

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

## Required GitHub configuration

Two
[GitHub Environments](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment)
back the workflows: `preview` and `production`. `production` requires a manual reviewer approval
(the repo owner) before the job runs, restricted to deployments from `main`; `preview` has no
protection rule — see the fork-PR guard below for why that's still safe.

Repository/environment configuration:

| Name                    | Kind                                             | Used by                                                      | Notes                                                                                |
| ----------------------- | ------------------------------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `CLOUDFLARE_API_TOKEN`  | **environment secret**, `preview` environment    | `deploy-preview.yml` (declares `environment: preview`)       | scoped token, see permissions below — account-level only, no zone access             |
| `CLOUDFLARE_API_TOKEN`  | **environment secret**, `production` environment | `deploy-production.yml` (declares `environment: production`) | scoped token, see permissions below — account-level + `odograph.dev` zone            |
| `CLOUDFLARE_ACCOUNT_ID` | repository variable (`gh variable set`)          | both workflows                                               | `8b655d0dde6d223b9ce11116a014973a` — not sensitive, so it's a variable, not a secret |

**Same secret name, two different values, scoped per
[GitHub Environment](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment).**
Every same-repo PR triggers `deploy-preview.yml` with no manual approval gate;
`deploy-production.yml` only runs after the `production` environment's required-reviewer approval.
Giving the unattended preview path a credential that can also edit the production zone's DNS/routes
would be a needless blast-radius increase — a bug in the preview deploy step, or a compromised
dependency in that job, would otherwise be able to reach production infrastructure it has no
legitimate reason to touch. A job only sees the secret for the environment it declares
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
  before merge.
- `.github/workflows/deploy-preview.yml` — re-runs the same checks, applies any pending D1
  migrations to `odograph-preview` (idempotent), then uploads the PR head commit as a new Worker
  Version of `odograph-preview` (never promoted) and comments the stable per-PR preview URL on the
  PR. Same-repo PRs only. No separate cleanup workflow — there's no per-PR resource to tear down.
- `.github/workflows/deploy-production.yml` — re-runs the same checks, applies any pending D1
  migrations to `odograph-production` (idempotent), then deploys `main` to the `production`
  environment. Pauses for the required reviewer approval before it runs.

Migrations only ever apply through these two workflows — never run
`wrangler d1 migrations apply --remote` from a local machine, for the same reason there's no local
`wrangler deploy` path (constitution Principle XII).

See each workflow file for the exact steps; this document describes intent and stays in sync with
them manually — if you change a workflow's trigger or target, update this table in the same PR.
