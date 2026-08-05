import { Hono } from "hono";
import { tenantContext } from "../../../middleware/tenant-context";
import type { AppEnv } from "../../../types";

// Lets the client discover an existing valid session on page load — needed because
// magic-link/Google OIDC sign-in completes via a server-side redirect that sets a cookie but never
// runs any client-side code, unlike passkey where the ceremony's own response already carries
// {userId, tenantId}. 401 (via tenantContext) is the "no session" answer, same as every other
// authenticated route.
export const whoami = new Hono<AppEnv>();

whoami.use("*", tenantContext);

whoami.get("/", (c) => {
  return c.json(c.get("tenant"));
});
