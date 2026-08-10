# Quickstart: Vehicle Document Records — CRUD, Expiry Tracking, and Attachments

No new infrastructure to provision — this feature reuses the `ATTACHMENTS` R2 bucket specs/007
already set up.

## 1. Apply the new migration locally

```sh
wrangler d1 migrations apply odograph-preview --local
```

## 2. Run the automated test suite

```sh
deno task test
```

Expect `tests/server/document-crud.test.ts` to pass — CRUD lifecycle, cross-tenant isolation, the
`isExpired` flag across past/future/absent expiry dates, attachment upload/download, rejection of a
spoofed/oversized/disallowed upload, a fixture JPEG's EXIF/GPS data confirmed stripped from the
stored bytes, and vehicle deletion cleaning up its documents' R2 attachments.

Also confirm the existing `fuel-record-crud`/`service-record-crud` suites still pass after the
`attachmentKey()` signature change (research.md) — both call sites are updated, not just added to.

## 3. Manual smoke test end-to-end

```sh
deno task dev
```

1. Add a document to a vehicle with just a title and category — confirm it appears in that
   vehicle's document list.
2. Add a second document with an expiry date in the past — confirm it's visibly flagged as expired
   in the list; add a third with a future expiry date — confirm it's not flagged.
3. Upload a real photo (ideally one with GPS EXIF data, e.g. straight off a phone) as an attachment
   — confirm it appears, and that downloading it back gives a file with no recoverable EXIF/GPS
   data (check with `exiftool` or similar).
4. Attempt to upload a renamed non-image file (e.g. a `.txt` renamed to `.jpg`) — confirm it's
   rejected.
5. Delete the vehicle — confirm the document and its attachment are gone, and (once deployed
   against a real bucket) that the R2 object no longer exists either.
