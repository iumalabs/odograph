# Phase 1 Data Model: Dev-Only Magic-Link Token Retrieval Endpoint

No new data entities, no D1 schema change. This feature reads the existing `magic_link_tokens`
table (migration 0003) through the existing, unmodified `findMagicLinkTokenByEmail` repository
function — it adds no field, no table, and no new query shape beyond what that function already
executes.
