# Phase 1 Data Model: Dedicated Settings Screen

No new data entities, no D1 schema change, no new server-side state. This feature relocates three
already-existing client components (`ApiTokens`, `PushNotifications`, `AccountDeletion`) into a new
screen composition; each continues to read/write via its existing, unmodified API wrapper
(`api-tokens.ts`, `push.ts`, `account.ts`) and existing backend routes. There is nothing new to
model.
