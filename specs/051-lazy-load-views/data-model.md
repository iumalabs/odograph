# Data Model: Lazy-Load Non-Initial Views

No data model — this feature has no entities, no schema, and no API surface. It changes only
*when* already-existing client component code is downloaded, not any data that flows through the
app.

## New in-memory-only concept

- **`LazyViewBoundary`**: not a data entity — a React component (`src/client/components/LazyViewBoundary.tsx`)
  combining a `Suspense` boundary and a small error boundary. Its only "state" is transient React
  render state (pending / error / resolved), never persisted, never sent to the server.
