# Research: Vehicle CRUD

## GDPR erasure decision: Delete, cascading from `tenants`

**Decision**: `vehicles.tenant_id REFERENCES tenants(id) ON DELETE CASCADE`; the table's own erasure
decision is Delete, not anonymise.

**Rationale**: specs/001's `tenants` decision is already Delete ("a tenant with no remaining users
has no reason to persist... deletion of a tenant's other data (vehicles, records, attachments) is
each of those future features' responsibility as they're built"). Vehicles are the tenant's
operational data, not an individual user's personal-identity record the way `users.email` is — there
is no reason to keep a tombstoned vehicle row around after the tenant that owned it is gone, unlike
`users`, which specs/001 anonymises rather than deletes specifically to avoid orphaning *other*
tenant-owned data (a vehicle) that might still need to reference *a* user. Once the tenant itself
goes, the vehicle has no remaining owner to preserve referential integrity for.

**Alternatives considered**:

- Anonymise (blank out `name`/`make`/`model`/`vin`, keep the row) — rejected: there's no future
  reader of an orphaned, ownerless vehicle row; keeping it serves no purpose `probe_resources`'s own
  precedent ("Delete. Test-fixture data with no retention value") already established for
  structurally similar tenant-scoped rows.

## Retiring `probe_resources`/`_tenant-isolation-probe`

**Decision**: This feature deletes `probe_resources` (table + repository functions) and
`_tenant-isolation-probe.ts` (route), replacing every existing test's use of them with an
equivalent call against the new `/vehicles` endpoints.

**Rationale**: `_tenant-isolation-probe.ts`'s own comment states this explicitly: "Delete this file
and its mount point... in the first PR that adds one [a real tenant-scoped resource]." `vehicles` is
that resource. Leaving the placeholder in place after a real resource exists would mean two parallel
"prove tenant isolation" code paths with no reason for both to exist, and — more concretely — six
existing test files depend on the probe purely as a "resolve this session cookie to a tenantId"
utility, unrelated to what those tests are actually about (auth ceremonies, rate limiting, session
lifecycle). Each of those call sites swaps to an equivalent `/vehicles` call with no change to what
the test asserts; `tenant-isolation.test.ts` itself is superseded outright since `vehicles.test.ts`
proves the identical cross-tenant-refusal property against a real resource instead of a synthetic
one.

**Alternatives considered**:

- Keep the probe alongside vehicles, retire it in a later cleanup PR — rejected: the comment already
  called this moment out specifically, and deferring it only grows the number of test files that
  come to depend on it in the meantime (this feature is exactly the trigger condition it named).
