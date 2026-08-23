import * as Sentry from "@sentry/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { buildClientMonitoringConfig } from "./monitoring";
import { registerServiceWorker } from "./pwa";
import { init as initOfflineQueue } from "./offline/queue";
import "./design/tokens.css";
import "./design/base.css";
import "./design/responsive.css";

// specs/054-error-monitoring: production-only, PII-scrubbed error/trace capture (config lives in
// ./monitoring.ts, gated by __WRANGLER_ENV__ — see FR-004/FR-005). Initialized before the first
// render so it can capture errors from render itself, not just post-mount.
Sentry.init(buildClientMonitoringConfig());

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerServiceWorker();
void initOfflineQueue();
