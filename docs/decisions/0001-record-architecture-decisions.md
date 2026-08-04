# 1. Record architecture decisions

Date: 2026-08-05

## Status

Accepted

## Context

We need a record of the architecturally significant decisions made on this project — decisions that
are expensive to reverse and that future contributors (human or agent) need the _why_ for, not just
the _what_.

Product-level decisions with user-facing consequences are locked in the constitution
(`.specify/memory/constitution.md`, "Additional Constraints"). This ADR log is for decisions that
are architectural/technical rather than product-level: they support or implement the constitution,
they don't amend it.

## Decision

We use Architecture Decision Records (ADRs), one per file, numbered sequentially in this directory,
following Michael Nygard's format (Title / Status / Context / Decision / Consequences).

An ADR is warranted when a decision is hard to reverse, affects multiple future features, or
resolves a genuine trade-off between viable options — not for routine implementation choices.

## Consequences

Every non-trivial architectural choice from here on gets an ADR: status `Proposed` while under
discussion, `Accepted` once settled, `Superseded by
NNNN` when a later ADR replaces it. ADRs are
never deleted or edited to pretend a decision was never made — supersede instead.
