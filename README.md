# Odograph

[![CI](https://github.com/iumalabs/odograph/actions/workflows/ci.yml/badge.svg)](https://github.com/iumalabs/odograph/actions/workflows/ci.yml)
[![E2E](https://github.com/iumalabs/odograph/actions/workflows/e2e.yml/badge.svg)](https://github.com/iumalabs/odograph/actions/workflows/e2e.yml)
[![Deploy Production](https://github.com/iumalabs/odograph/actions/workflows/deploy-production.yml/badge.svg)](https://github.com/iumalabs/odograph/actions/workflows/deploy-production.yml)
[![Production](https://img.shields.io/website?url=https%3A%2F%2Fodograph.iuma.dev&label=production)](https://odograph.iuma.dev)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/workers/)
[![License: AGPL v3](https://img.shields.io/github/license/iumalabs/odograph)](LICENSE)
[![Open issues](https://img.shields.io/github/issues/iumalabs/odograph)](https://github.com/iumalabs/odograph/issues)
[![Last commit](https://img.shields.io/github/last-commit/iumalabs/odograph)](https://github.com/iumalabs/odograph/commits/main)

Odograph is an open-source, self-hostable vehicle maintenance tracker — an alternative to
[LubeLogger](https://github.com/hargata/lubelogger) built on the Cloudflare stack (Workers, D1, R2,
KV).

> **E2E badge note:** runs on a daily schedule (03:00 UTC) rather than per-PR/per-merge — see
> [Status](#status) below. It reflects the last scheduled (or manually dispatched) run, not
> necessarily the current `main` commit.

## Status

Early-stage, spec-driven development. `CI` (fmt/lint/typecheck/test/build) and `CodeQL` gate every
pull request; `E2E` (Playwright) is intentionally _not_ PR-blocking — it runs on a daily schedule
instead, so its own flakiness can't hold up unrelated work. This is a provisional call: if
regressions that E2E would have caught start landing on `main` with any frequency, it goes back to
gating PRs.

See [`.specify/memory/constitution.md`](.specify/memory/constitution.md) for the non-negotiable
project rules and locked product decisions, and [`docs/`](docs/) for architecture and deployment
docs as they land.

## Stack

- **Runtime**: Cloudflare Workers (`workerd`)
- **API**: [Hono](https://hono.dev/), versioned under `/api/v1`
- **Client**: React SPA ([Vite](https://vite.dev/)), served via Workers Static Assets, built as a
  PWA
- **Data**: D1 (relational), R2 (attachments), KV (sessions / settings cache)
- **Scheduled work**: Cron Triggers
- **E2E**: [Playwright](https://playwright.dev/)
- **Toolchain**: [Deno](https://deno.com/) — package manager (`npm:` specifiers in `deno.json`, no
  `package.json`), task runner, `fmt`, `lint`, `test`. Never a runtime dependency inside deployed
  Worker code, which still runs on `workerd` — Deno only resolves/runs dependencies during
  development, build, and CI.

## Development process

This project is built with [GitHub Spec Kit](https://github.com/github/spec-kit) (Spec-Driven
Development). Every change to product behavior goes through:

```
/speckit-specify → /speckit-plan → /speckit-tasks → /speckit-analyze → /speckit-implement
```

`/speckit-analyze` is a mandatory gate before implementation. Dependency bumps, formatting, docs
edits, CI config, and pure bugfixes (no behavior change vs. an existing spec) may be committed
directly — see [CONTRIBUTING.md](CONTRIBUTING.md) for the full policy.

Specs, plans, and tasks for each feature live under `specs/<NNN>-<slug>/`, generated and maintained
by the Spec Kit skills in `.claude/skills/`.

## Environments

| Environment | Trigger            | URL                                                |
| ----------- | ------------------ | -------------------------------------------------- |
| Preview     | every pull request | per-PR `*.workers.dev` URL, posted as a PR comment |
| Production  | merge to `main`    | `https://odograph.iuma.dev`                        |

All deploys happen through GitHub Actions — see [docs/deployment.md](docs/deployment.md). There is
no local `wrangler deploy` path to either environment.

Want to run your own instance instead of contributing to this one? See
[docs/self-hosting.md](docs/self-hosting.md) (plain `wrangler` from your own machine, no GitHub
Actions required) and [docs/backup-restore.md](docs/backup-restore.md).

## Getting started

Requires [Deno](https://deno.com/) 2.x — the project's sole package manager and task runner.
Dependencies (Vite, Wrangler, React, etc.) are declared as `npm:` specifiers in `deno.json` and
resolved into a Deno-managed `node_modules/` — there is no `package.json`.

```sh
deno install          # resolves dependencies into node_modules/
deno task cf-typegen  # generates worker-configuration.d.ts (no postinstall hook under Deno)
deno task dev          # vite dev — local Worker + client, hot reload
deno task check         # fmt --check + lint + typecheck + test, same as CI runs
```

Other useful tasks: `deno task build` (a locally-oriented build using wrangler.toml's default
top-level bindings — CI uses `build:preview`/`build:production` instead, which resolve Wrangler's
named `[env.preview]`/`[env.production]` bindings explicitly; see vite.config.ts), `deno task test`
(Vitest against the real Workers runtime via `@cloudflare/vitest-pool-workers`),
`deno task
typecheck`. There is no `deploy` task runnable from a laptop — see
[Environments](#environments) and [docs/deployment.md](docs/deployment.md).

## License

[GNU AGPL-3.0](LICENSE).
