# Deployment

All deploys happen through GitHub Actions (constitution Principle XII). There is no supported local
`wrangler deploy` path to preview or production — `wrangler dev` for local iteration is fine,
`wrangler deploy` against a shared environment is not.

## Cloudflare account

- Account: **Max Yugai** (`8b655d0dde6d223b9ce11116a014973a`)
- Zone: `odograph.dev` (already active in the account)

## Environments

|              | Preview                                                                                  | Production                     |
| ------------ | ---------------------------------------------------------------------------------------- | ------------------------------ |
| Trigger      | every pull request (opened/synchronized)                                                 | push to `main`                 |
| Worker name  | `odograph-pr-<PR number>`                                                                | `odograph`                     |
| URL          | `https://odograph-pr-<PR number>.kgz.workers.dev`                                        | `https://odograph.dev`         |
| D1 / R2 / KV | dedicated `-preview` resources, shared across all open PRs                               | dedicated production resources |
| Lifecycle    | created on PR open, redeployed on every push to the PR branch, **torn down on PR close** | long-lived                     |

Preview intentionally shares one set of D1/R2/KV resources across all open PRs (not one set per PR)
to keep the Cloudflare footprint bounded; it is a smoke-test environment, not an isolated data
sandbox. If a PR needs isolated data to test destructive migrations, say so in the PR description
and coordinate manually rather than assuming isolation.

Production uses the custom domain `odograph.dev` via a Cloudflare custom domain / route binding,
configured in `wrangler.toml` under `[env.production]`.

## Required GitHub configuration

Two
[GitHub Environments](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment)
back the workflows: `preview` and `production`. `production` requires a manual reviewer approval
(the repo owner) before the job runs, restricted to deployments from `main`; `preview` has no
protection rule — see the fork-PR guard below for why that's still safe.

Repository configuration:

| Name                              | Kind                         | Used by                                            | Notes                                                                                |
| --------------------------------- | ---------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `CLOUDFLARE_PREVIEW_API_TOKEN`    | secret (`gh secret set`)     | `deploy-preview.yml`, `deploy-preview-cleanup.yml` | scoped token, see permissions below — account-level only, no zone access             |
| `CLOUDFLARE_PRODUCTION_API_TOKEN` | secret (`gh secret set`)     | `deploy-production.yml`                            | scoped token, see permissions below — account-level **and** zone `odograph.dev`      |
| `CLOUDFLARE_ACCOUNT_ID`           | variable (`gh variable set`) | all three                                          | `8b655d0dde6d223b9ce11116a014973a` — not sensitive, so it's a variable, not a secret |

**Two separate tokens, not one shared token.** Every same-repo PR triggers `deploy-preview.yml` with
no manual approval gate; `deploy-production.yml` only runs after the `production` environment's
required-reviewer approval. Giving the unattended preview path a credential that can also edit the
production zone's DNS/routes would be a needless blast-radius increase — a bug in the preview deploy
step, or a compromised dependency in that job, would otherwise be able to reach production
infrastructure it has no legitimate reason to touch.

### `CLOUDFLARE_PREVIEW_API_TOKEN` permissions

Create via My Profile → API Tokens → Create Token → Custom token. Not the account-wide "Edit
Cloudflare Workers" template, which grants more than deploy needs.

**Account resources** (account `8b655d0dde6d223b9ce11116a014973a`) — no zone resources at all, since
preview never touches a custom domain:

| Permission         | Level |
| ------------------ | ----- |
| Workers Scripts    | Edit  |
| Workers KV Storage | Edit  |
| Workers R2 Storage | Edit  |
| D1                 | Edit  |
| Account Settings   | Read  |

### `CLOUDFLARE_PRODUCTION_API_TOKEN` permissions

Same account resources as above, **plus** zone resources (zone `odograph.dev`) — required because
the production route uses `custom_domain = true` in `wrangler.toml`, which provisions a DNS record
under the hood:

| Permission     | Level |
| -------------- | ----- |
| Workers Routes | Edit  |
| DNS            | Edit  |

Without the zone-scoped permissions, `deploy --env production` fails when it tries to attach
`odograph.dev`.

Set both tokens with `gh secret set CLOUDFLARE_PREVIEW_API_TOKEN` /
`gh secret set CLOUDFLARE_PRODUCTION_API_TOKEN` from a trusted machine — they should never be pasted
into chat or committed anywhere.

**Fork PRs never get an auto-deployed preview.** `deploy-preview.yml` and its cleanup counterpart
both gate on `github.event.pull_request.head.repo.full_name == github.repository`, so a pull request
from a fork can't reach `CLOUDFLARE_PREVIEW_API_TOKEN` through the preview flow. `ci.yml` still runs
(and is the required check) for fork PRs — they just don't get a live preview URL until the project
has a real external-contributor trust process.

## Workflows

- `.github/workflows/ci.yml` — format/lint/typecheck/test/build on every push and PR. Required check
  before merge.
- `.github/workflows/deploy-preview.yml` — re-runs the same checks, then deploys the PR head commit
  to the `preview` environment and comments the preview URL on the PR. Same-repo PRs only.
- `.github/workflows/deploy-preview-cleanup.yml` — deletes the per-PR preview worker when the PR
  closes (merged or not). Same-repo PRs only.
- `.github/workflows/deploy-production.yml` — re-runs the same checks, then deploys `main` to the
  `production` environment. Pauses for the required reviewer approval before it runs.

See each workflow file for the exact steps; this document describes intent and stays in sync with
them manually — if you change a workflow's trigger or target, update this table in the same PR.
