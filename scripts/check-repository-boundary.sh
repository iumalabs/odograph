#!/usr/bin/env bash
set -euo pipefail

# Fails if any file other than src/server/db/repository.ts *queries* D1
# directly (.prepare(...)) — the repository layer must be the only place
# that does (constitution Principle I; finding M2 from /speckit-analyze on
# specs/001-tenant-session-foundation, which found FR-002/SC-002 were
# convention-only with no automated check). Passing the D1Database binding
# itself into a repository function (e.g. `createTenant(c.env.DB)`) is the
# intended pattern and is not what this checks for.

matches=$(grep -rn --include='*.ts' -E '\.prepare\(' src/server \
  | grep -v '^src/server/db/repository\.ts:' || true)

if [ -n "$matches" ]; then
  echo "Repository-layer boundary violated — D1 query (.prepare) outside src/server/db/repository.ts:" >&2
  echo "$matches" >&2
  exit 1
fi

echo "Repository-layer boundary OK: only src/server/db/repository.ts queries D1 directly"
