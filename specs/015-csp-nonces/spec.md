# Feature Specification: Strict CSP with Per-Request Nonces

**Feature Branch**: `015-csp-nonces`

**Created**: 2026-08-06

**Status**: Draft

**Input**: User description: "Strict Content-Security-Policy with per-request nonces (issue #24,
milestone M8): serve a strict CSP on every page load, using a fresh, unique nonce per request rather
than 'unsafe-inline', per constitution Principle VII. This is the CSP half of issue #24 — the
rate-limiting half is already fully implemented (every write route in this codebase already sits
behind rateLimitBySession or rateLimitByIp, confirmed by audit), so this feature covers only what's
actually missing. Every HTML page response must include a CSP header restricting script and style
execution to same-origin sources plus a fresh per-request nonce, with no wildcard or 'unsafe-inline'
exception. The nonce must be cryptographically random, unique per request, and consistent between
the header and any nonce attribute the page's own markup uses. The policy must also sensibly cover
images (existing inline data-URI icons must keep working), fonts (self-hosted), and a sensible
default-src fallback, without weakening the no-unsafe-inline guarantee for scripts and styles. Out
of scope: rate limiting (already done), other already-satisfied Principle VII sub-requirements
(HttpOnly/Secure/SameSite cookies), and API tokens (a separate future issue). A CSP violation must
never silently break the app — it must surface as a visibly broken feature during this feature's own
testing, not a silent failure discovered later."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Every visitor is protected by a strict, unpredictable content policy (Priority: P1)

Anyone loading the application is protected by a browser-enforced content policy that only allows
the application's own legitimate scripts and styles to run — never an inline script an attacker
might manage to inject, because it could never predict this request's unique authorization value.

**Why this priority**: This is the entire point of the feature — a baseline defense against script
injection that exists on every page load, not an opt-in or partial protection.

**Independent Test**: Load the application, inspect the response headers for a policy that restricts
scripts and styles to the application's own origin plus a per-request value, and confirm two
separate page loads never share the same value.

**Acceptance Scenarios**:

1. **Given** any page load, **When** the response is inspected, **Then** it includes a policy that
   restricts script and style execution to the application's own origin plus a per-request
   authorization value, with no blanket exception that would allow an arbitrary inline script or
   style to run.
2. **Given** two separate page loads (even back-to-back, even from the same visitor), **When** their
   policies are compared, **Then** the per-request authorization value is different every time —
   never reused, never guessable in advance.
3. **Given** the application's own legitimate scripts and styles, **When** the page loads, **Then**
   they run exactly as before — this protection is invisible to a legitimate visitor.
4. **Given** a hypothetical inline script injected without knowing this request's authorization
   value (e.g. via a future, otherwise-successful injection vulnerability elsewhere in the app),
   **When** the browser encounters it, **Then** it refuses to run it.

---

### User Story 2 - Nothing the application legitimately relies on breaks (Priority: P2)

Every existing part of the application — signing in, managing vehicles and their records, the
dashboard, icons, fonts — continues to work exactly as before once the stricter policy is in place.

**Why this priority**: The protection in User Story 1 is worthless if shipping it breaks the
product; this is the verification pass that makes it safe to ship, sequenced after the policy itself
exists to actually verify against.

**Independent Test**: Walk through every existing screen and flow in the application with the new
policy active and confirm nothing that worked before now fails, errors, or renders incorrectly.

**Acceptance Scenarios**:

1. **Given** the application's existing icons that are embedded directly in the page rather than
   loaded as separate image files, **When** the page renders under the new policy, **Then** they
   display exactly as before.
2. **Given** the application's self-hosted fonts, **When** any page loads, **Then** they load and
   render exactly as before.
3. **Given** every existing user-facing flow this application has (authentication, vehicle/record
   management, dashboard), **When** each is exercised under the new policy, **Then** none of them
   fail, error, or behave differently than before this feature shipped.

### Edge Cases

- A future feature that legitimately needs to run an inline script or style must be able to do so by
  using this request's own authorization value — the mechanism this feature puts in place must
  already support that without requiring a policy redesign later, even though nothing in the
  application needs it today.
- The policy must never be satisfied by a wildcard, an "unsafe" exception, or any origin other than
  the application's own for scripts and styles specifically — even a single such exception defeats
  the protection User Story 1 depends on.
- No monitoring or reporting mechanism for policy violations is required by this feature — it is a
  pure enforcement mechanism in this slice; observing violations, should that ever be wanted, is a
  separate future concern.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Every page response the application serves MUST include a policy restricting script
  execution to the application's own origin plus a per-request authorization value, with no wildcard
  or blanket "unsafe" exception.
- **FR-002**: The same policy MUST restrict style execution the same way, with no wildcard or
  blanket "unsafe" exception.
- **FR-003**: The per-request authorization value MUST be unpredictable and unique to that single
  request — never reused across requests, never derivable in advance.
- **FR-004**: The policy MUST continue to permit every image source the application currently relies
  on, including icons embedded directly in the page, without weakening the script/style restriction
  to do so.
- **FR-005**: The policy MUST continue to permit the application's self-hosted fonts.
- **FR-006**: The policy MUST specify a safe default behavior for any resource type it doesn't
  explicitly name, restricting it to the application's own origin rather than leaving it
  unrestricted.
- **FR-007**: Applying this policy MUST NOT break any existing, legitimate application functionality
  — verified across every current screen and flow before this feature ships.
- **FR-008**: The policy MUST apply to every page load uniformly across every deployed environment
  end users ever reach (preview and production) — there is no page or flow in a deployed environment
  this protection excludes. See Assumptions for the one deliberate exception (the local development
  tooling environment, which end users never reach).

### Key Entities

No new data entities — this feature has no persisted state of its own. It changes what every page
response includes, not what the application stores.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of page responses include the restrictive policy described in FR-001/FR-002, with
  zero wildcard or "unsafe" exceptions for scripts or styles.
- **SC-002**: Across any sample of consecutive page loads, 100% show a different per-request
  authorization value than every other load in the sample.
- **SC-003**: Every existing user-facing flow in the application continues to work with zero
  functional regression once this policy is active, verified end to end.
- **SC-004**: An inline script that doesn't carry the correct per-request authorization value is
  blocked by the browser 100% of the time it's attempted, verified by a deliberate test case.

## Assumptions

- **Not applied in the local development tooling environment**: this policy protects real visitors
  of a deployed application, not a developer's own local iteration loop — the local dev environment
  the application's own build tooling runs under is excluded (discovered during implementation: that
  tooling injects its own inline script for its live-reload mechanism, which a strict policy would
  block, breaking local development for every future contributor with no security benefit, since
  nothing there is exposed to a real visitor). Every environment an actual visitor can ever reach
  (preview, production) is unaffected by this exception and gets the full policy.
- **No violation reporting in this slice**: this feature is pure enforcement — no endpoint collects
  or logs policy violations. Adding one later is a separate, additive feature, not a rework of this
  one.
- **No third-party origins**: nothing the application currently does requires loading a script,
  style, or other resource from any origin other than its own, so the policy permits same-origin
  sources only (plus the per-request value for scripts/styles) — this can be revisited if a future
  feature genuinely needs a third-party resource.
- **Additional hardening directives** (beyond the script/style/image/font/default behaviors this
  spec names) may reasonably be included as extra defense-in-depth without being individually
  specified here, so long as they don't loosen any guarantee this spec does name.
