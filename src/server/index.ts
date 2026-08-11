import { Hono } from "hono";
import { health } from "./routes/v1/health";
import { devSession } from "./auth/dev-session";
import { devMagicLink } from "./auth/dev-magic-link";
import { devOidc } from "./auth/dev-oidc";
import { passkeyAuth } from "./routes/v1/auth/passkey";
import { magicLinkAuth } from "./routes/v1/auth/magic-link";
import { googleOidcAuth } from "./routes/v1/auth/oidc/google";
import { whoami } from "./routes/v1/auth/whoami";
import { vehicles } from "./routes/v1/vehicles";
import { serviceRecords } from "./routes/v1/service-records";
import { fuelRecords } from "./routes/v1/fuel-records";
import { documents } from "./routes/v1/documents";
import { planCards } from "./routes/v1/plan-cards";
import { reminderRules } from "./routes/v1/reminder-rules";
import { account } from "./routes/v1/account";
import { tokens } from "./routes/v1/tokens";
import { push } from "./routes/v1/push";
import { search } from "./routes/v1/search";
import { vinLookup } from "./routes/v1/vin-lookup";
import { evaluateAllDocumentReminders, evaluateAllReminders } from "./db/repository";
import { buildCspHeader, generateNonce } from "./security/csp";
import type { AppEnv, VapidSecrets } from "./types";

const app = new Hono<AppEnv>();

app.route("/api/v1/health", health);
app.route("/api/v1/_dev/session", devSession);
app.route("/api/v1/_dev/magic-link-token", devMagicLink);
app.route("/api/v1/_dev/oidc-google", devOidc);
app.route("/api/v1/auth/passkey", passkeyAuth);
app.route("/api/v1/auth/magic-link", magicLinkAuth);
app.route("/api/v1/auth/oidc/google", googleOidcAuth);
app.route("/api/v1/auth/whoami", whoami);
app.route("/api/v1/vehicles", vehicles);
app.route("/api/v1/service-records", serviceRecords);
app.route("/api/v1/fuel-records", fuelRecords);
app.route("/api/v1/documents", documents);
app.route("/api/v1/plan-cards", planCards);
app.route("/api/v1/reminder-rules", reminderRules);
app.route("/api/v1/account", account);
app.route("/api/v1/tokens", tokens);
app.route("/api/v1/push", push);
app.route("/api/v1/search", search);
app.route("/api/v1/vin-lookup", vinLookup);

export default {
  // `assets.run_worker_first = true` (wrangler.toml) routes every request here first, including
  // the ones a static-asset layer would otherwise serve without ever reaching the Worker — the
  // only way to attach a fresh per-request CSP nonce to the HTML document (specs/015-csp-nonces).
  // The branch below is on the URL path, never on app.fetch's response status: a legitimate API
  // 404 (e.g. a missing vehicle id) must stay a JSON 404, never fall through to
  // env.ASSETS.fetch() and silently become the SPA's index.html (research.md).
  fetch: async (request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> => {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return app.fetch(request, env, ctx);
    }

    const assetResponse = await env.ASSETS.fetch(request);
    // Only preview/production serve the pre-built dist/client (zero inline <script>/<style>,
    // confirmed — specs/015-csp-nonces/research.md). "development" is `deno task dev`'s Vite dev
    // server, which injects its own un-nonced inline script (the React Fast Refresh preamble) —
    // a strict CSP there blocks Vite's own tooling, not an attacker, breaking local iteration for
    // every future contributor. CSP is a production-hardening concern with nothing to protect in
    // local dev, so it's skipped there rather than chasing Vite internals to nonce-tag them.
    if (env.ENVIRONMENT === "development") {
      return assetResponse;
    }
    if (!assetResponse.headers.get("content-type")?.startsWith("text/html")) {
      return assetResponse;
    }

    const response = new Response(assetResponse.body, assetResponse);
    response.headers.set("Content-Security-Policy", buildCspHeader(generateNonce()));
    return response;
  },
  // The daily sweep (wrangler.toml's [triggers]) — the only entry point in this codebase
  // reaching evaluateAllReminders/evaluateAllDocumentReminders, both of which deliberately have
  // no per-request TenantContext. Two sequential sweeps, one shared schedule (specs/024
  // research.md) — no separate Cron trigger needed for document expiry reminders.
  scheduled: async (
    _controller: ScheduledController,
    env: Env & VapidSecrets,
    _ctx: ExecutionContext,
  ) => {
    await evaluateAllReminders(env);
    await evaluateAllDocumentReminders(env);
  },
} satisfies ExportedHandler<Env>;
