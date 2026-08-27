import type { TenantContext } from "./db/repository";

// GOOGLE_CLIENT_ID/SECRET are Workers secrets (set via `wrangler secret put`, never in
// wrangler.toml — specs/004's research.md), so `wrangler types` never generates them onto the
// ambient `Env` interface. Declared here instead of relying on codegen.
type GoogleOidcSecrets = {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
};

// Same reasoning as GoogleOidcSecrets — Workers secrets, never in wrangler.toml. One more value
// than Google needs: Cloudflare Access's OIDC endpoints are per-operator-team, not global
// constants, so the team domain itself has to be configurable (specs/061 research.md Decision 6).
type CloudflareOidcSecrets = {
  CLOUDFLARE_ACCESS_TEAM_DOMAIN: string;
  CLOUDFLARE_ACCESS_CLIENT_ID: string;
  CLOUDFLARE_ACCESS_CLIENT_SECRET: string;
};

// Same reasoning as GoogleOidcSecrets — a one-time-generated Workers secret pair (spec 022
// quickstart.md), never in wrangler.toml, never codegen'd. Exported: evaluateAllReminders and the
// scheduled handler both need it directly, outside any Hono AppEnv context (the Cron Trigger has
// no request/response cycle for Hono to bind Variables to). Optional, unlike GoogleOidcSecrets:
// push notifications must degrade gracefully (not crash the sweep or the app) before the one-time
// VAPID setup has run in a given environment (research.md).
export type VapidSecrets = {
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
};

export type AppEnv = {
  Bindings: Env & GoogleOidcSecrets & CloudflareOidcSecrets & VapidSecrets;
  Variables: {
    tenant: TenantContext;
    sessionTokenHash: string;
    authScope: "session" | "read" | "write";
  };
};
