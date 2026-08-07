# Backup and restore

Odograph stores data in three Cloudflare services with three different backup stories. This applies
to both a self-hosted instance and this project's own `odograph.dev` (substitute your own
database/bucket/namespace names throughout).

## D1 (vehicles, records, reminders, sessions, credentials, tokens)

D1 is the source of truth for everything except attachment files. Back it up with a SQL export:

```sh
deno run -A npm:wrangler@<pinned version> d1 export <your-database-name> --remote --output backup.sql
```

This produces a plain SQL dump (schema + data) you can store anywhere — encrypt it before storing it
off-Cloudflare, since it contains password-equivalent credential hashes (session/API token hashes)
and every user's data.

**Restore** to a fresh or existing database:

```sh
deno run -A npm:wrangler@<pinned version> d1 execute <your-database-name> --remote --file backup.sql
```

Restoring into a database that already has data will fail on primary-key/unique-constraint conflicts
rather than silently overwrite — that's d1 execute's normal SQL behavior, not a special safeguard
this project added. Restore into an empty database (a freshly created one, or one you've truncated)
if you're doing a full recovery, not a merge.

**Recommended cadence**: before every migration you're nervous about, and on whatever regular
schedule matches how much data loss you're willing to tolerate (a personal/small-fleet tool losing a
day of service records is a much smaller deal than losing a week — pick accordingly). D1 exports are
cheap and fast at this project's data scale; there's no reason not to run one before any
schema-changing deploy.

## R2 (attachment files — photos, receipts)

R2 has no built-in "export bucket" command. Two supported approaches:

- **[rclone](https://rclone.org/)** (recommended for anything beyond a handful of files): configure
  an S3-compatible remote pointed at your R2 bucket
  ([Cloudflare's rclone guide](https://developers.cloudflare.com/r2/examples/rclone/)), then
  `rclone sync
  r2:<your-bucket> ./local-backup/`.
- **`wrangler r2 object get`** one key at a time, for a small number of objects or scripting a
  one-off backup — list keys first with `wrangler r2 object list <your-bucket> --remote` (JSON,
  script around it), then fetch each.

**Restore** is the reverse of whichever tool you used to back up (`rclone sync` in the other
direction, or `wrangler r2 object put` per key). Object keys are already tenant/record-scoped paths
(`tenants/<tenantId>/service-records/<recordId>/<attachmentId>`), so restoring the exact same keys
back into the bucket re-links them to the matching D1 rows automatically — no separate mapping step,
as long as the D1 restore and the R2 restore are from backups taken close enough together that the
same objects and rows both still exist in both.

**D1 and R2 backups drift out of sync with each other over time** — an attachment uploaded after
your last D1 export but before your last R2 backup would restore as an orphaned object with no
matching row (harmless, just wasted space); the reverse (a D1 row referencing an attachment that
never made it into the R2 backup) is the case that actually matters, since the app would show a
broken/missing attachment. Back up D1 and R2 close together in time, and note the export timestamps
somewhere you'll see them during a real recovery.

## KV (session cache)

The `SESSION_CACHE` KV namespace is a cache-aside layer, not a source of truth — every session it
holds is a copy of a row that already exists in D1's `sessions` table (see
`src/server/auth/session.ts`'s own comment: "Cache-aside, not source of truth"). **Do not back this
up.** After a D1 restore, every entry in KV either matches a still-valid D1 row (harmless) or
references a session D1 no longer has (falls through to D1 on the next lookup, gets treated as
invalid, and is naturally overwritten or expires on its own TTL) — there's nothing to reconcile.

## Full disaster recovery

1. Provision a fresh D1 database, KV namespace, and R2 bucket if the originals are gone (see
   [self-hosting.md](self-hosting.md)).
2. Restore the D1 SQL dump.
3. Restore the R2 objects.
4. Leave KV empty — it repopulates itself from D1 as real requests come in.
5. Point `wrangler.toml`'s bindings at the restored resources' new ids if they changed, and
   redeploy.

There is no partial/point-in-time recovery beyond "restore your most recent export" — D1 exports are
full snapshots, not incremental. If you need finer-grained recovery, increase your backup frequency
rather than looking for a feature this project doesn't have.
