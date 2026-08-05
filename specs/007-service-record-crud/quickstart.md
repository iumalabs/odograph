# Quickstart: Service Record CRUD + Attachments

## 1. Prerequisite: an R2 bucket (one-time, external, owner action)

No feature has used R2 yet — a bucket needs to exist before this feature can be deployed.

1. Create two R2 buckets (preview and production), e.g. `odograph-preview-attachments` and
   `odograph-production-attachments`.
2. Add an `[[r2_buckets]]` entry (binding `ATTACHMENTS`) to `wrangler.toml`'s default/preview/
   production sections, pointing at the matching bucket name per environment.

Local dev/test use Miniflare's local R2 simulation automatically — no real bucket needed until an
actual deploy.

## 2. Apply the new migration locally

```sh
wrangler d1 migrations apply odograph-preview --local
```

## 3. Run the automated test suite

```sh
deno task test
```

Expect `tests/server/service-record-crud.test.ts` to pass — CRUD lifecycle, cross-tenant isolation,
attachment upload/download, rejection of a spoofed/oversized/disallowed upload, a fixture JPEG's
EXIF/GPS data confirmed stripped from the stored bytes, and vehicle deletion cleaning up its service
records' R2 attachments.

## 4. Manual smoke test end-to-end

```sh
deno task dev
```

1. Add a service record to a vehicle with just a date and description — confirm it appears in that
   vehicle's history.
2. Upload a real photo (ideally one with GPS EXIF data, e.g. straight off a phone) as an attachment
   — confirm it appears, and that downloading it back gives a file with no recoverable EXIF/GPS
   data (check with `exiftool` or similar).
3. Attempt to upload a renamed non-image file (e.g. a `.txt` renamed to `.jpg`) — confirm it's
   rejected.
4. Delete the vehicle — confirm the service record and its attachment are gone, and (once deployed
   against a real bucket) that the R2 object no longer exists either.
