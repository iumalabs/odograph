# Odograph

Odograph is an open-source, self-hostable vehicle maintenance tracker — an alternative to
[LubeLogger](https://github.com/hargata/lubelogger) built on the Cloudflare stack (Workers, D1, R2,
KV).

## Status

Early-stage, spec-driven development. See
[`.specify/memory/constitution.md`](.specify/memory/constitution.md) for the non-negotiable project
rules and locked product decisions, and [`docs/`](docs/) for architecture and deployment docs as
they land.

## Stack

- **Runtime**: Cloudflare Workers (`workerd`)
- **API**: [Hono](https://hono.dev/), versioned under `/api/v1`
- **Client**: React SPA ([Vite](https://vite.dev/)), served via Workers Static Assets, built as a
  PWA
- **Data**: D1 (relational), R2 (attachments), KV (sessions / settings cache)
- **Scheduled work**: Cron Triggers
- **E2E**: [Playwright](https://playwright.dev/)
- **Toolchain**: [Deno](https://deno.com/) for `fmt` / `lint` / `test` / `task` only — never as a
  runtime dependency inside Worker code. Wrangler stays npm-based.

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
| Production  | merge to `main`    | `https://odograph.dev`                             |

All deploys happen through GitHub Actions — see [docs/deployment.md](docs/deployment.md). There is
no local `wrangler deploy` path to either environment.

## Getting started

Requires Node.js 22+, [Deno](https://deno.com/) (toolchain only), and Wrangler (installed as a dev
dependency below).

```sh
npm install      # also generates worker-configuration.d.ts (postinstall)
npm run dev      # vite dev — local Worker + client, hot reload
deno task check  # fmt --check + lint + typecheck + test, same as CI runs
```

Other useful commands: `npm run build` (production build), `npm test` (Vitest against the real
Workers runtime via `@cloudflare/vitest-pool-workers`), `npm run typecheck`. There is no
`npm run deploy` — see [Environments](#environments) and [docs/deployment.md](docs/deployment.md).

## License

[GNU AGPL-3.0](LICENSE).
