import type { TenantContext } from "./db/repository";

export type AppEnv = {
  Bindings: Env;
  Variables: {
    tenant: TenantContext;
    sessionTokenHash: string;
  };
};
