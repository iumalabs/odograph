# Phase 1 Data Model: PWA Installability & App Shell

No new data entities, no D1 schema change, no new server-side state. This feature is entirely
client-side/build-time: a static manifest file, static icon files, and a service worker that manages
the browser's own Cache Storage for this origin's static assets. The only "storage" involved is the
browser's Cache Storage API, which is not modeled as an application entity — it holds exact copies
of already-existing build artifacts (JS/CSS/icon files), not new data.
