# Feature Specification: GDPR Account Erasure

**Feature Branch**: `016-gdpr-account-erasure`

**Created**: 2026-08-07

**Status**: Draft

**Input**: User description: "GDPR account erasure (issue #22, milestone M8): let an authenticated
owner permanently delete their entire account — every vehicle, service record, fuel record,
attachment, reminder rule, session, passkey credential, magic-link identity, and Google identity
associated with it — in one deliberate, irreversible action, per constitution Principle VIII. The
decision this feature documents for Principle VIII: full deletion, never anonymisation, for every
table this project has — there's no retention requirement overriding an erasure request for a
personal vehicle-maintenance log. Given how destructive and irreversible this action is, it must
require the owner to take a deliberate, explicit confirming step beyond a single ordinary click.
Once deletion completes, the owner's current session must end immediately. Out of scope: any
admin-initiated deletion of another tenant's account (no cross-tenant admin role exists); any
soft-delete/recovery-grace-period; and ephemeral pre-authentication artifacts with no personal-data
content and no relation to any specific account."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - An owner permanently erases their account (Priority: P1)

An owner who no longer wants to use the application requests that everything associated with their
account be permanently removed, and after a deliberate confirmation, it's gone — every vehicle they
tracked, every service and fuel record, every attachment, every reminder, and every way they could
sign back in.

**Why this priority**: This is the entire point of the feature — a real, complete erasure
capability, not a partial one that leaves data behind.

**Independent Test**: As an owner with vehicles, records, attachments, and reminders, request and
confirm account deletion, then verify nothing associated with that account is retrievable through
the application or reachable in underlying storage.

**Acceptance Scenarios**:

1. **Given** a signed-in owner with vehicles, service records, fuel records, attachments, and
   reminder rules, **When** they request and confirm account deletion, **Then** every one of those
   is permanently removed, including the stored attachment files themselves, not just their records.
2. **Given** a signed-in owner with no vehicles or records at all, **When** they request and confirm
   account deletion, **Then** their account, sessions, and any sign-in credentials are still fully
   removed.
3. **Given** a signed-in owner who has an outstanding sign-in link they haven't used yet, **When**
   they confirm account deletion, **Then** that unused sign-in link no longer works, even though it
   isn't tied to a specific vehicle or record.
4. **Given** an account deletion has just completed, **When** the same owner's browser makes any
   further request using their prior session, **Then** it's refused exactly as it would be for
   someone who was never signed in.
5. **Given** an account deletion has just completed, **When** anyone looks for that account's data
   anywhere the application stores it, **Then** none of it remains, in any form — not
   deleted-looking placeholders, not anonymised records, nothing.

---

### User Story 2 - An owner is protected from an accidental, irreversible deletion (Priority: P2)

Because account deletion can never be undone, an owner can't trigger it with a single stray click —
they must take a second, deliberate action to actually confirm it.

**Why this priority**: This is a safety net around User Story 1's capability, not a separate
capability of its own — deletion has to exist first for a confirmation step to protect anything, but
the protection itself is independently verifiable and critical enough to call out on its own.

**Independent Test**: Start the deletion flow but stop short of the final confirming step, and
verify the account and all of its data are completely untouched and the owner remains normally
signed in and able to use the application.

**Acceptance Scenarios**:

1. **Given** a signed-in owner, **When** they initiate account deletion but do not complete the
   required confirming step, **Then** nothing about their account is deleted or changed.
2. **Given** a signed-in owner who stopped short of confirming deletion, **When** they continue
   using the application afterward, **Then** everything works exactly as it did before they started
   the deletion flow.
3. **Given** the deletion confirmation step itself, **When** it's presented, **Then** it clearly and
   unambiguously communicates that the action is permanent and cannot be undone.

### Edge Cases

- An owner's attachments (photos) are removed from wherever they're actually stored, not just the
  records that reference them — a deletion that leaves the files themselves behind is incomplete.
- If any part of the deletion cannot complete for any reason, the account MUST be left exactly as it
  was before the attempt was made — never partially deleted, never in a broken in-between state.
- Deletion is only ever reachable by the account's own authenticated owner — there is no path for
  anyone else, including another tenant, to trigger it.
- Pre-authentication artifacts that were never tied to a specific account in the first place (e.g.
  an in-progress sign-in attempt's temporary verification data) have nothing account-specific to
  erase and are correctly outside this feature's scope.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: An authenticated owner MUST be able to request permanent deletion of their own
  account.
- **FR-002**: The deletion request MUST require a second, deliberate confirming step distinct from
  the initial request — an ordinary single click MUST NOT be sufficient to delete an account.
- **FR-003**: Once confirmed, deletion MUST permanently remove every vehicle, service record, fuel
  record, reminder rule, session, passkey credential, magic-link identity, and Google identity
  associated with the account.
- **FR-004**: Deletion MUST remove every stored attachment file associated with the account, not
  only the records that reference them.
- **FR-005**: Deletion MUST also remove any outstanding, not-yet-used sign-in link issued for the
  account's own email address, even where no other direct relationship to the account exists.
- **FR-006**: The system MUST NOT retain or anonymise any of this data after deletion completes —
  removal is total, with no retention period and no exceptions.
- **FR-007**: Once deletion completes, the owner's current session MUST end immediately, and no
  further request may be honored as if they were still signed in.
- **FR-008**: If deletion cannot complete in full for any reason, the system MUST leave the account
  entirely intact and unchanged — no partial deletion may ever be left in place.
- **FR-009**: Deletion MUST only be reachable by the account's own authenticated owner — never by
  another tenant, and never without authentication.

### Key Entities

No new data entities — this feature removes existing ones (Tenant, User, Vehicle, Service Record,
Fuel Record, Attachment, Reminder Rule, Session, Passkey Credential, Magic-Link Identity, Google
Identity) in their entirety for one account. It introduces no new stored state of its own beyond
whatever is needed to carry out and confirm the deletion request itself in the moment it happens.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: An owner can complete account deletion, start to finish, in a single sitting with no
  more than two deliberate steps (request, then confirm).
- **SC-002**: After deletion, zero records remain anywhere in the system for that account — verified
  directly against underlying storage, not only through what the application's own interface shows.
- **SC-003**: After deletion, zero attachment files remain in storage for that account.
- **SC-004**: 100% of deletion attempts that stop short of the required confirming step result in
  zero data loss and zero account changes.
- **SC-005**: 100% of requests made with a session from a just-deleted account are refused
  identically to a request from someone who was never signed in.

## Assumptions

- **Confirmation mechanism**: the specific shape of the second, deliberate confirming step (e.g. a
  typed confirmation phrase, a clearly separated final button with an explicit warning) is an
  implementation detail left open here — the requirement is that it exists and cannot be triggered
  by a single ordinary click, not any particular UI mechanic. Given this project's scale (an
  individual or small-fleet tool, not an enterprise system), a lightweight mechanism is appropriate;
  re-authentication at the moment of deletion is not required.
- **Full deletion, not anonymisation, is the Principle VIII decision for every table this project
  has** — there is no audit, legal, or financial retention requirement for a personal
  vehicle-maintenance log that would justify keeping anonymised records after an erasure request.
- **No admin-initiated or cross-tenant deletion**: this feature is exclusively self-service: an
  owner deleting their own account. This project has no administrative role that could delete
  another tenant's account, and none is introduced by this feature.
- **No soft delete or recovery window**: deletion is immediate and permanent once confirmed — there
  is no "restore my account" path, matching the constitution's own framing of erasure as permanent,
  not a reversible trash bin.
- **Pre-authentication artifacts with no account relationship** (e.g. an in-progress sign-in
  attempt's temporary verification data) are out of scope — they were never associated with a
  specific account and expire naturally on their own regardless of whether any account is ever
  deleted.
