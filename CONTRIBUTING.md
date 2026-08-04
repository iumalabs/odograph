# Contributing to Odograph

## Process

All product-behavior changes go through the Spec Kit cycle, in order:

1. `/speckit-specify` — write/update the feature spec
2. `/speckit-plan` — produce the implementation plan
3. `/speckit-tasks` — generate the dependency-ordered task list
4. `/speckit-analyze` — cross-check spec/plan/tasks for consistency
   (**mandatory gate** — do not skip)
5. `/speckit-implement` — execute the tasks

Each feature lives under `specs/<NNN>-<slug>/` (spec.md, plan.md, tasks.md,
and any supporting design docs). Slice features small enough that one
`/speckit-implement` run produces one reviewable pull request.

### Exempt from the full cycle

These may be committed directly, without a spec:

- Dependency bumps
- Formatting-only changes
- Docs / README edits
- CI configuration
- Bugfixes that change no behavior described in an existing spec

Anything that changes product behavior needs a spec first, however small it
looks.

## Before every principle change

The project constitution (`.specify/memory/constitution.md`) is the source
of truth for non-negotiable invariants and locked product decisions. Amend
it via `/speckit-constitution` — don't restate or contradict its rules in
individual specs.

## Git workflow

- Branch from a freshly-fetched `origin/main` for every task — never stack
  branches.
- Descriptive commits in English (see constitution Principle XI); several
  logically-scoped commits are preferred over one giant commit.
- Rebase onto `origin/main` immediately before pushing.
- Open the PR yourself once checks pass locally; never merge your own PR.

## Quality gates

- `deno fmt` must pass (enforced in pre-commit and CI).
- Tests passing is necessary but not sufficient — review every PR against
  the spec's intent, not just its checklist.

## Environments

- Every PR gets an isolated Cloudflare preview deployment via GitHub
  Actions.
- Merges to `main` deploy to production via GitHub Actions.
- There is no local `wrangler deploy` path — see
  [docs/deployment.md](docs/deployment.md).
