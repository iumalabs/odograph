# Self-hosting

Odograph runs entirely on Cloudflare's free-tier-friendly stack (Workers, D1, R2, KV) — this guide
walks through deploying your own instance to your own Cloudflare account, distinct from
[docs/deployment.md](deployment.md), which documents this project's own GitHub-Actions-only pipeline
for `odograph.iuma.dev`. A self-hosted instance doesn't need GitHub Actions at all — plain
`wrangler` commands from your own machine are the supported path here.

## Prerequisites

- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (the free plan is enough to run this;
  D1/R2/KV all have generous free tiers).
- [Deno](https://deno.com/) 2.x — the project's sole package manager and task runner (see the main
  [README](../README.md#getting-started)).
- `deno install` once to resolve dependencies, then every `wrangler` command below runs through
  `deno task` or `deno run -A npm:wrangler@<pinned version>` (check `deno.json`'s `wrangler` `npm:`
  specifier for the exact pinned version) — never a bare, unpinned `npm:wrangler` invocation.

## 1. Authenticate wrangler

```sh
deno run -A npm:wrangler@<pinned version> login
```

Follow the browser prompt to authorize wrangler against your Cloudflare account.

## 2. Provision D1, KV, and R2

Odograph needs one D1 database, one KV namespace, and one R2 bucket. Create them (naming is up to
you — the values below are examples):

```sh
deno run -A npm:wrangler@<pinned version> d1 create odograph
deno run -A npm:wrangler@<pinned version> kv namespace create odograph-sessions
deno run -A npm:wrangler@<pinned version> r2 bucket create odograph-attachments
```

Each command prints an id. Copy `wrangler.toml`'s `[env.production]` block (or add a new named
environment of your own) and replace `database_id`, the KV `id`, and `bucket_name` with the values
you just got. Leave `migrations_dir = "migrations"` as-is — that path is fixed by the repo layout,
not per-deployment.

## 3. Apply migrations

```sh
deno run -A npm:wrangler@<pinned version> d1 migrations apply <your-database-name> --remote --env <your-env-name>
```

This runs every file under `migrations/` in order, tracked by wrangler's own migrations table — safe
to re-run after pulling updates, since already-applied migrations are skipped automatically.

## 4. Configure secrets

Google sign-in is optional — the app works fully without it (passkey and magic-link sign-in have no
external dependency). If you want it,
[create an OAuth 2.0 Client ID](https://console.cloud.google.com/apis/credentials) (type: Web
application) with your deployed origin as an authorized redirect URI, then:

```sh
deno run -A npm:wrangler@<pinned version> secret put GOOGLE_CLIENT_ID --env <your-env-name>
deno run -A npm:wrangler@<pinned version> secret put GOOGLE_CLIENT_SECRET --env <your-env-name>
```

If you skip this, leave the "Continue with Google" button unused — clicking it will fail against
Google's own authorization endpoint rather than break the rest of the app.

## 5. Email sending (magic-link sign-in and reminder notifications)

Both features send email through Cloudflare's
[Email Workers `send_email` binding](https://developers.cloudflare.com/email-routing/email-workers/send-email-workers/),
which requires [Email Routing](https://developers.cloudflare.com/email-routing/) to be enabled on a
zone you control, with a verified destination address. The `send_email` binding in `wrangler.toml`
is already wired up; you only need to:

1. Enable Email Routing for your domain in the Cloudflare dashboard.
2. Change the hardcoded `FROM_ADDRESS` constant in `src/server/auth/magic-link.ts` and
   `src/server/email/reminder-notification.ts` (currently `auth@odograph.iuma.dev`) to an address on
   your own verified domain, and redeploy.

Without this, magic-link sign-in and reminder emails will fail to send — passkey sign-in and every
other feature are unaffected.

## 6. Deploy

```sh
deno task build:production   # or your own env-scoped build task — see vite.config.ts
deno run -A npm:wrangler@<pinned version> deploy --env <your-env-name>
```

This uploads the Worker and static assets together. Your instance is live at the `*.workers.dev` URL
wrangler prints, or your own custom domain if you added a `routes` entry to your environment block
(see `[env.production]`'s `routes` in `wrangler.toml` for the pattern).

## 7. Custom domain (optional)

Add your domain to Cloudflare (if it isn't already), then add a `routes` entry to your environment
block in `wrangler.toml`:

```toml
routes = [{ pattern = "your-domain.example", custom_domain = true }]
```

Redeploy after adding it.

## Keeping your instance updated

Pull upstream changes, re-run step 3 (migrations are additive and idempotent — re-running is safe
even if nothing changed), then repeat step 6. There is no automatic update mechanism; this is a
self-hosted app you own and update on your own schedule.

## What you don't need for self-hosting

- GitHub Actions, GitHub Environments, or any CI/CD secret — those exist for _this_ project's own
  `odograph.iuma.dev` deployment (see [docs/deployment.md](deployment.md)), not because Odograph
  itself requires them. Plain `wrangler deploy` from your machine is the fully-supported self-host
  path.
- A GitHub account at all, beyond cloning the source.
