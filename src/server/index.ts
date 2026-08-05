import { Hono } from "hono";
import { health } from "./routes/v1/health";
import { devSession } from "./auth/dev-session";
import { passkeyAuth } from "./routes/v1/auth/passkey";
import { magicLinkAuth } from "./routes/v1/auth/magic-link";
import { googleOidcAuth } from "./routes/v1/auth/oidc/google";
import { whoami } from "./routes/v1/auth/whoami";
import { vehicles } from "./routes/v1/vehicles";
import { serviceRecords } from "./routes/v1/service-records";
import { fuelRecords } from "./routes/v1/fuel-records";
import { reminderRules } from "./routes/v1/reminder-rules";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();

app.route("/api/v1/health", health);
app.route("/api/v1/_dev/session", devSession);
app.route("/api/v1/auth/passkey", passkeyAuth);
app.route("/api/v1/auth/magic-link", magicLinkAuth);
app.route("/api/v1/auth/oidc/google", googleOidcAuth);
app.route("/api/v1/auth/whoami", whoami);
app.route("/api/v1/vehicles", vehicles);
app.route("/api/v1/service-records", serviceRecords);
app.route("/api/v1/fuel-records", fuelRecords);
app.route("/api/v1/reminder-rules", reminderRules);

export default app;
