import type { TenantContext } from "./db/repository";

// GOOGLE_CLIENT_ID/SECRET are Workers secrets (set via `wrangler secret put`, never in
// wrangler.toml — specs/004's research.md), so `wrangler types` never generates them onto the
// ambient `Env` interface. Declared here instead of relying on codegen.
type GoogleOidcSecrets = {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
};

export type AppEnv = {
  Bindings: Env & GoogleOidcSecrets;
  Variables: {
    tenant: TenantContext;
    sessionTokenHash: string;
    authScope: "session" | "read" | "write";
  };
};
