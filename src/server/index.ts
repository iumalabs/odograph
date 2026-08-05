import { Hono } from "hono";
import { health } from "./routes/v1/health";
import { devSession } from "./auth/dev-session";
import { passkeyAuth } from "./routes/v1/auth/passkey";
import { magicLinkAuth } from "./routes/v1/auth/magic-link";
import { googleOidcAuth } from "./routes/v1/auth/oidc/google";
import { vehicles } from "./routes/v1/vehicles";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();

app.route("/api/v1/health", health);
app.route("/api/v1/_dev/session", devSession);
app.route("/api/v1/auth/passkey", passkeyAuth);
app.route("/api/v1/auth/magic-link", magicLinkAuth);
app.route("/api/v1/auth/oidc/google", googleOidcAuth);
app.route("/api/v1/vehicles", vehicles);

export default app;
