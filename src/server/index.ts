import { Hono } from "hono";
import { health } from "./routes/v1/health";
import { devSession } from "./auth/dev-session";
import { tenantIsolationProbe } from "./routes/v1/_tenant-isolation-probe";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();

app.route("/api/v1/health", health);
app.route("/api/v1/_dev/session", devSession);
app.route("/api/v1/_tenant-isolation-probe", tenantIsolationProbe);

export default app;
