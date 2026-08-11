# Feature Specification: Search Across Vehicles and Records

**Feature Branch**: `028-search`

**Created**: 2026-08-11

**Status**: Draft

**Input**: User description: "Search across vehicles and records (GitHub issue #78, milestone
M11). Add a single free-text search that looks across all of an owner's own vehicles and their
service records, fuel records, and documents (plan cards are not mentioned and are out of scope),
matching the design prototype's dedicated search icon (a bare magnifying-glass icon and label, no
further field/behavior spec — field selection and result shape are this spec's own call). Unlike
every other read route in this codebase, this is tenant-wide, not scoped to one already-selected
vehicle — the whole point is finding which vehicle a matching record belongs to. Searches: vehicle
name/make/model/VIN; service record description/notes; fuel record station/notes; document
title/notes. A case-insensitive substring match, computed on read directly against D1, scoped to
the caller's own tenant — no new table, no external search index/service. Results are grouped by
entity type, each result identifying which vehicle it belongs to and enough of the matched text to
show why it matched. Unlike the existing cost aggregates' semantic-duplicate exclusion, a record
flagged as a duplicate still appears in search results — a deliberate difference, not an
oversight. A query shorter than 2 characters is rejected. An empty result set is a valid, normal
response, never an error."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - An owner finds a record without remembering which vehicle it's on (Priority: P1)

As an owner with multiple vehicles, I want to type a word or phrase I remember (a shop name, a
part, a document title) and immediately see every matching vehicle, service record, fuel record,
and document across my whole garage — without first guessing which vehicle to look under.

**Why this priority**: This is the entire value of the feature — a search that only worked inside
one already-selected vehicle wouldn't solve the actual problem (not remembering which vehicle).

**Independent Test**: Create records for the same distinctive term spread across two different
vehicles, search for that term, and confirm results from both vehicles appear, each identifying
which vehicle it belongs to.

**Acceptance Scenarios**:

1. **Given** an authenticated owner with multiple vehicles, **When** they search for a term that
   matches a vehicle's own name, make, model, or VIN, **Then** that vehicle appears in the
   results.
2. **Given** the same owner, **When** they search for a term that matches a service record's
   description or notes, a fuel record's station or notes, or a document's title or notes, on any
   of their vehicles, **Then** that record appears in the results, identifying which vehicle it
   belongs to.
3. **Given** the same owner, **When** their search term matches nothing, **Then** they receive an
   empty result set, not an error.
4. **Given** the same owner, **When** they search using a substring that only partially matches a
   longer word (e.g. part of a shop name), **Then** matching results are still found — an exact
   full-word match is not required.
5. **Given** the same owner, **When** they search using different letter casing than what was
   originally recorded, **Then** matching results are still found.

---

### User Story 2 - Search never reveals another tenant's data (Priority: P1)

As an owner, when I search, I only ever see my own vehicles and records — never anything belonging
to a different account, even if their data happens to contain the exact term I searched for.

**Why this priority**: A cross-tenant leak here would be a serious violation of this system's core
tenant-isolation guarantee — equal priority to the search actually working at all.

**Independent Test**: Seed matching data for the same search term under two different accounts,
search from one of them, and confirm only that account's own results appear.

**Acceptance Scenarios**:

1. **Given** two different accounts each have a vehicle or record matching the same search term,
   **When** one account searches for that term, **Then** only that account's own matching results
   appear — never the other account's.

---

### User Story 3 - A too-short query is rejected rather than matching everything (Priority: P2)

As an owner, if I search with only one character (e.g. while still typing), I want the system to
tell me the query is too short rather than returning an overwhelming, meaningless "everything"
result set.

**Why this priority**: A real but secondary guard — the feature is still useful without it (a
one-character search would just return a lot of noisy results), but a query that broad is
essentially never useful and cheap to reject upfront.

**Independent Test**: Submit a one-character query and confirm it's rejected rather than
returning results.

**Acceptance Scenarios**:

1. **Given** an authenticated owner, **When** they submit a search query shorter than two
   characters, **Then** the request is rejected rather than matching everything.

### Edge Cases

- What happens to a record flagged as a semantic duplicate (constitution D-005)? It still appears
  in search results — unlike the existing cost aggregates, which exclude it, a duplicate is still
  real, findable data (e.g. a user searching specifically to locate and resolve a flagged
  duplicate). This is a deliberate, documented difference from the aggregate features' behavior.
- What happens if a vehicle matches the search term but has no matching records, or vice versa?
  Each entity type's own match is independent — a vehicle can appear in results without any of its
  records matching, and a record can appear even if its own vehicle's name doesn't match.
- What happens if a vehicle or record is deleted between two searches? The next search simply
  reflects current data — nothing about search results is cached or stale by design.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST let an authenticated user search across all vehicles and records they
  own — never scoped to a single, already-selected vehicle.
- **FR-002**: System MUST reject a search query shorter than two characters, rather than treating
  it as a match-everything query.
- **FR-003**: A vehicle matches if the query is found, case-insensitively, as a substring of its
  name, make, model, or VIN.
- **FR-004**: A service record matches if the query is found, case-insensitively, as a substring
  of its description or notes.
- **FR-005**: A fuel record matches if the query is found, case-insensitively, as a substring of
  its station or notes.
- **FR-006**: A document matches if the query is found, case-insensitively, as a substring of its
  title or notes.
- **FR-007**: System MUST NOT exclude a record from search results merely because it's flagged as
  a semantic duplicate — this is a deliberate difference from the existing cost aggregates'
  exclusion rule.
- **FR-008**: System MUST return results grouped by entity type (vehicles, service records, fuel
  records, documents), with each non-vehicle result identifying which vehicle it belongs to.
- **FR-009**: System MUST NOT reveal any vehicle or record belonging to a different tenant, under
  any search term, identically to every other tenant-isolation guarantee in this system.
- **FR-010**: An empty result set (no matches found) MUST be a valid, normal response — never an
  error.

### Key Entities

- **Search result**: Not a stored entity — a computed-on-read, tenant-scoped match against
  existing vehicles/service records/fuel records/documents for one query, grouped by entity type.
  Each result carries enough identifying detail (which vehicle, and the matched text) to be
  useful without a further lookup.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: An owner can locate a record without first knowing which vehicle it's under, in a
  single search.
- **SC-002**: 100% of a search's results belong to the searching user's own tenant, verified by a
  test that seeds matching data under two different accounts and confirms cross-account isolation
  (SC of User Story 2).
- **SC-003**: A substring match succeeds regardless of case or of being only part of a longer word,
  verified by a test using mixed-case, partial-word queries against known data.
- **SC-004**: A search matching nothing returns an empty, valid result set 100% of the time, never
  an error.
- **SC-005**: A query shorter than two characters is rejected 100% of the time, never treated as a
  broad match.

## Assumptions

- **Substring matching only, no ranking/relevance scoring**: results are grouped by entity type
  and (within a type) in a stable, predictable order — no "best match first" ranking, which would
  need a real search index this feature deliberately doesn't introduce.
- **ASCII-range case-insensitivity**: matching relies on the database's built-in case-insensitive
  substring comparison, which reliably covers the ASCII (Latin) range; case-insensitivity for
  non-ASCII scripts (e.g. Cyrillic) is not guaranteed to the same degree — a known, documented
  limitation rather than a hidden gap, acceptable for v1 given no full-text-search dependency is
  being introduced.
- **Plan cards are out of scope**, per the issue's own explicit list of what's searched — a
  reasonable future extension, not required here.
- **No search-history or saved-search feature** — each search is a one-off, stateless query.
- **A vehicle's/record's existing tenant/ownership model** governs what a search can ever return —
  no separate permission model, and searching never bypasses any existing per-record access rule.
