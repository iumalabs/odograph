# Feature Specification: Production Error & Performance Monitoring (FlightDeck)

**Feature Branch**: `054-error-monitoring`

**Created**: 2026-08-23

**Status**: Draft

**Input**: User description: "Connect Odograph's production client and server to FlightDeck (an external, Sentry-protocol-compatible observability platform run by the organization) so unhandled errors, performance traces, and releases are visible to the team without relying on user-reported bugs. A project and ingest endpoint for Odograph already exist on FlightDeck's side; this feature covers only the Odograph-side integration."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Unhandled errors are visible without a user report (Priority: P1)

As a maintainer, when an unhandled error occurs anywhere in the production app (client-side UI code or server-side API handling), I want it to show up automatically in the monitoring platform's issue list — with enough context (stack trace, environment, release/version, request path) to start diagnosing it — without waiting for a user to notice and report it.

**Why this priority**: This is the core value of the feature — closing the gap between "an error happened in production" and "someone on the team knows about it." Every other capability (traces, logs, release tagging) is secondary to this.

**Independent Test**: Deliberately trigger an unhandled error in a production-like deployment (client and, separately, server) and confirm it appears as an issue in the monitoring platform within a short, bounded time, with a readable stack trace and no PII in the payload.

**Acceptance Scenarios**:

1. **Given** a production deployment, **When** an unhandled JavaScript error occurs in the client UI, **Then** an issue appears in the monitoring platform's issue list containing a stack trace, the release/version, and the environment, but no tenant-identifying data (email, session token, request/response bodies).
2. **Given** a production deployment, **When** an API request handler throws an unhandled error, **Then** an issue appears in the monitoring platform's issue list with the same guarantees as above, and the user's request still completes with a normal error response (the monitoring capture never itself breaks the request).
3. **Given** the monitoring platform's ingest endpoint is temporarily unreachable or slow, **When** an error occurs, **Then** the user-facing behavior (error page/response) is unaffected — monitoring failure is silent and never surfaces to the end user or delays their response.

---

### User Story 2 - Errors are attributable to a specific release (Priority: P2)

As a maintainer, when I see a spike of new issues in the monitoring platform, I want to know which deployed version introduced them, so I can correlate a regression with a specific PR/release rather than guessing.

**Why this priority**: Without release attribution, triage still works but is much slower — every issue investigation starts with "was this always broken, or did we just ship it." This meaningfully speeds up the response loop that User Story 1 enables.

**Independent Test**: Deploy two different versions to production in sequence, trigger an error unique to the second version, and confirm the resulting issue is tagged with the second version's release identifier, not the first.

**Acceptance Scenarios**:

1. **Given** a production deployment at a known version, **When** an error occurs, **Then** the resulting issue is tagged with that version's release identifier.
2. **Given** two consecutive production releases, **When** the monitoring platform's release view is inspected, **Then** each release shows only the issues newly introduced or still occurring in that release, not merged into a single undifferentiated stream.

---

### User Story 3 - Performance regressions are visible, not just hard failures (Priority: P3)

As a maintainer, I want a sample of production request performance (which endpoints are slow, how slow) visible in the monitoring platform, so I can catch a regression that degrades the experience without throwing an outright error.

**Why this priority**: Valuable, but errors (P1) and release attribution (P2) deliver the majority of the benefit on their own; performance visibility is a refinement that can land after the core capture path is proven reliable.

**Independent Test**: Generate a representative burst of production traffic and confirm a proportionate sample of request traces (not necessarily every request) appears in the monitoring platform's traces view, showing duration broken down in a way that identifies the slow step.

**Acceptance Scenarios**:

1. **Given** normal production traffic, **When** a request is sampled for tracing, **Then** its duration and a breakdown of major steps (e.g. request handling vs. underlying data access) are visible in the monitoring platform.
2. **Given** the configured sampling rate, **When** traffic volume is high, **Then** only a bounded proportion of requests are traced — trace collection must not scale linearly with all production traffic.

---

### Edge Cases

- What happens when the monitoring platform's ingest endpoint is unreachable for an extended period? The application MUST keep serving users normally; queued/failed monitoring events MAY be dropped rather than retried indefinitely or buffered in a way that consumes meaningful resources.
- What happens during local development or a PR preview deployment? Errors and traces from those environments MUST NOT be forwarded to the same production monitoring project — preview deployments are shared across every open PR (existing infrastructure decision) and would otherwise pollute production signal with test/iteration noise.
- What happens if the ingest credential needs to be rotated (e.g. the monitoring platform reissues it, or it needs to be revoked)? Rotation happens via a normal code change/PR — acceptable because the credential is not sensitive (see FR-008/Assumptions: it is a write-only ingest identifier, always visible in the shipped client bundle regardless of where it's stored, so there's no confidentiality property to protect by externalizing it).
- What happens to an error that legitimately contains user-entered free-text (e.g. a vehicle nickname, a note field) in its stack trace or breadcrumb context? That data MUST be excluded or redacted before the event leaves the application — the same posture the project already takes toward tenant data elsewhere (Constitution Principle I, VIII).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST capture unhandled client-side errors during normal production use and forward them to the configured external monitoring endpoint.
- **FR-002**: The system MUST capture unhandled server-side (API) errors during normal production use and forward them to the same external monitoring endpoint.
- **FR-003**: Every captured error and trace MUST be tagged with the environment (production) and the currently deployed release/version identifier.
- **FR-004**: The system MUST NOT forward errors or traces captured in non-production environments (local development, PR preview deployments) to the production monitoring project.
- **FR-005**: The system MUST NOT include tenant-identifying data (email addresses, session tokens/cookies, API tokens, full request or response bodies, free-text user content) in any event forwarded to the monitoring platform.
- **FR-006**: The application's existing outbound-connection security policy MUST be updated to allow requests only to the monitoring platform's specific ingest origin — no broader relaxation of the existing policy is permitted.
- **FR-007**: A failure, timeout, or slow response from the monitoring platform's ingest endpoint MUST NOT delay, fail, or otherwise alter the response the application returns to the user.
- **FR-008**: The ingest credential used to authorize event submission MAY be committed directly in source rather than treated as a protected secret — unlike this project's other third-party credentials, it is a write-only ingest identifier that is unavoidably visible in the shipped client bundle by design (the monitoring platform's own protocol embeds it in client-side code), so externalizing it would not add any real confidentiality.
- **FR-009**: Performance trace collection MUST use a sampling rate below 100% of requests, adjustable via a code change without being treated as a scope change, rather than capturing every request.
- **FR-010**: Every captured error and trace MUST be tagged with the release/version identifier already surfaced to users (the same value shown in the app's own version display), so a monitoring-platform issue can be correlated with a specific deployed build without cross-referencing a separate system.

### Key Entities

- **Error Event**: A single occurrence of an unhandled error — includes a stack trace, environment, release/version, and request path context; excludes tenant-identifying data.
- **Performance Trace**: A sampled record of a single request's duration and major processing steps, used to spot slow paths without capturing every request.
- **Release**: A deployed version identifier that groups error events and traces so they can be attributed to a specific shipped build.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An unhandled production error (client or server) is visible in the monitoring platform's issue list within 5 minutes of occurring, without any user report.
- **SC-002**: Monitoring capture introduces no observable increase in failed or delayed user-facing requests — verified by comparing error/latency rates for a representative period before and after rollout.
- **SC-003**: Manual review of a sample of captured error events after rollout finds zero instances of tenant-identifying data (email, session/API tokens, request bodies, free-text user content).
- **SC-004**: Zero preview-deployment or local-development events appear in the production monitoring project over a representative monitoring period.
- **SC-005**: For a release containing a known, deliberately introduced regression, the monitoring platform's release view correctly attributes the resulting issues to that release, distinguishing it from the prior release's issues.

## Assumptions

- The external monitoring platform (FlightDeck) and Odograph's project/ingest endpoint on it are already provisioned by the organization; provisioning or configuring the platform itself is out of scope here — this feature covers only the Odograph-side integration.
- Only the production environment is instrumented in this iteration; extending capture to preview deployments is out of scope and would require a separate decision given preview's shared, multi-PR nature.
- A reasonable default trace sampling rate (low, e.g. on the order of 10-20% of requests) is acceptable to start; it can be tuned later based on observed volume/cost without being treated as a scope change.
- The ingest credential is committed directly in source (not stored as an environment secret) — per the platform's own protocol it authorizes write-only event submission to a single project (no data reads), and it ships inside the client bundle regardless of where it's stored, so treating it as a protected secret would add process overhead without adding real confidentiality.
- "Logs" as a distinct monitoring-platform data type (as opposed to error events and traces) is out of scope for this iteration; nothing here precludes adding it later as a separate, additive change.
