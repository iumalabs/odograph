# Deployment

All deploys happen through GitHub Actions (constitution Principle XII).
There is no supported local `wrangler deploy` path to preview or
production — `wrangler dev` for local iteration is fine, `wrangler deploy`
against a shared environment is not.

## Cloudflare account

- Account: **Max Yugai** (`8b655d0dde6d223b9ce11116a014973a`)
- Zone: `odograph.dev` (already active in the account)

## Environments

| | Preview | Production |
|---|---|---|
| Trigger | every pull request (opened/synchronized) | push to `main` |
| Worker name | `odograph-pr-<PR number>` | `odograph` |
| URL | `https://odograph-pr-<PR number>.<workers-dev-subdomain>.workers.dev` | `https://odograph.dev` |
| D1 / R2 / KV | dedicated `-preview` resources, shared across all open PRs | dedicated production resources |
| Lifecycle | created on PR open, redeployed on every push to the PR branch, **torn down on PR close** | long-lived |

Preview intentionally shares one set of D1/R2/KV resources across all open
PRs (not one set per PR) to keep the Cloudflare footprint bounded; it is a
smoke-test environment, not an isolated data sandbox. If a PR needs isolated
data to test destructive migrations, say so in the PR description and
coordinate manually rather than assuming isolation.

Production uses the custom domain `odograph.dev` via a Cloudflare custom
domain / route binding, configured in `wrangler.toml` under
`[env.production]`.

## Required GitHub configuration

Two [GitHub Environments](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment)
back the workflows: `preview` and `production`. `production` has required
reviewers / protection rules; `preview` does not.

Repository secrets (set via `gh secret set <NAME>`, never committed):

| Secret | Used by | Notes |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | both workflows | scoped token: Workers Scripts (Edit), D1 (Edit), Workers R2 Storage (Edit), Workers KV Storage (Edit), Account Settings (Read) — for account `8b655d0dde6d223b9ce11116a014973a` only |
| `CLOUDFLARE_ACCOUNT_ID` | both workflows | `8b655d0dde6d223b9ce11116a014973a` |

The API token is scoped as narrowly as the Cloudflare dashboard allows for
the resource types above — not the account-wide "Edit Cloudflare Workers"
template, which grants more than deploy needs.

## Workflows

- `.github/workflows/ci.yml` — format/lint/typecheck/test/build on every
  push and PR. Required check before merge.
- `.github/workflows/deploy-preview.yml` — deploys the PR head commit to the
  `preview` environment and comments the preview URL on the PR. Runs after
  CI succeeds.
- `.github/workflows/deploy-preview-cleanup.yml` — deletes the per-PR
  preview worker when the PR closes (merged or not).
- `.github/workflows/deploy-production.yml` — deploys `main` to the
  `production` environment after CI succeeds on `main`.

See each workflow file for the exact steps; this document describes intent
and stays in sync with them manually — if you change a workflow's trigger
or target, update this table in the same PR.
