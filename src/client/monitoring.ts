import { browserTracingIntegration } from "@sentry/react";
import type { BrowserOptions } from "@sentry/react";
import { APP_VERSION } from "./version";

// @sentry/react doesn't export ErrorEvent directly at a stable import path usable from
// deno.json's import map — derived from BrowserOptions["beforeSend"] itself instead.
type ScrubbableEvent = Parameters<NonNullable<BrowserOptions["beforeSend"]>>[0];

// Sentry-protocol-compatible ingest identifier for FlightDeck's Odograph project. Not treated as a
// protected secret — it's a write-only event-submission identifier that ships inside the client
// bundle by design regardless of where it's stored (specs/054-error-monitoring/research.md).
const FLIGHTDECK_DSN =
  "https://fb19ac54c5823d902bd14198f6052dff@flightdeck.iuma.dev/a2e8589f-2405-4109-a364-865672b6963f";

/**
 * Strips anything that could carry tenant-identifying data (FR-005) from an outgoing event —
 * defense-in-depth on top of the `dataCollection` config below, which already disables cookie/body
 * collection at the source.
 */
function scrubEvent(event: ScrubbableEvent): ScrubbableEvent {
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    const headers = event.request.headers;
    if (headers) {
      for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === "cookie" || key.toLowerCase() === "authorization") {
          delete headers[key];
        }
      }
    }
  }
  return event;
}

export function buildClientMonitoringConfig(): BrowserOptions {
  return {
    dsn: FLIGHTDECK_DSN,
    environment: __WRANGLER_ENV__,
    release: APP_VERSION,
    // Errors are never sampled (FR-001 — every unhandled error is reported); this rate is for
    // performance traces only (FR-009, spec.md Assumptions).
    tracesSampleRate: 0.1,
    // browserTracingIntegration is what actually produces route/request traces —
    // tracesSampleRate alone is inert without it (User Story 3).
    integrations: [browserTracingIntegration()],
    // FR-004: capture is a structural no-op outside production — Sentry.init() is still always
    // called (research.md), it just never sends anything when this is false.
    enabled: __WRANGLER_ENV__ === "production",
    // FR-005: no cookies, no request/response bodies, no auto-populated user info. Headers are
    // still collected (useful for triage — e.g. content-type, user-agent) but with Cookie/
    // Authorization explicitly denied on top of the SDK's own built-in sensitive-value filtering.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpBodies: [],
      httpHeaders: {
        request: { deny: ["cookie", "authorization"] },
        response: { deny: ["set-cookie"] },
      },
    },
    beforeSend: (event) => scrubEvent(event),
  };
}
