# Phase 1 Data Model: Strict CSP with Per-Request Nonces

No new table, column, migration, or persisted entity of any kind. This feature changes a response
header computed fresh on every request; nothing about it is stored.

## Request-scoped value (not persisted)

| Value | Lifetime    | Notes                                                                                                                                                                                                                                       |
| ----- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nonce | One request | `crypto.getRandomValues`-derived, base64-encoded (research.md). Generated inside the request handler, used to build that single response's CSP header, then discarded — never written to D1, KV, or any log correlated with a user/session. |

## Server layer additions

- `src/server/security/csp.ts`: a nonce generator and `buildCspHeader(nonce: string): string`
  returning the full policy value per contracts/csp-policy.md — pure functions, no I/O, easily
  unit-testable in isolation from the request-handling glue in `index.ts`.

## GDPR erasure

N/A — no new table, column, or stored data of any kind.
