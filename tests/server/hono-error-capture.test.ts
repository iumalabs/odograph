import * as Sentry from "@sentry/cloudflare";
import { env } from "cloudflare:test";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildServerMonitoringConfig } from "../../src/server/monitoring/config";

// Regression test for issue #212: Hono's own default error handling catches every route
// handler's throw internally and resolves with a plain response, so it never escapes as an
// unhandled exception — Sentry.withSentry() only auto-captures exceptions that do escape
// `handler.fetch`. Mirrors src/server/index.ts's exact wiring (Hono app + app.onError calling
// Sentry.captureException, wrapped in Sentry.withSentry) — keep this in sync with that file if
// its error-handling wiring ever changes.
describe("server-side Hono route errors reach Sentry (specs/054-error-monitoring, issue #212)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("captures an exception thrown inside a route handler via app.onError", async () => {
    const app = new Hono();
    app.get("/boom", () => {
      throw new Error("regression test boom");
    });
    app.onError((err, c) => {
      Sentry.captureException(err, { mechanism: { handled: false, type: "hono.onError" } });
      return c.text("Internal Server Error", 500);
    });

    const wrapped = Sentry.withSentry(buildServerMonitoringConfig, {
      fetch: (request, honoEnv, ctx) => app.fetch(request, honoEnv, ctx),
    });

    const captureSpy = vi.spyOn(Sentry, "captureException");

    const res = await wrapped.fetch(
      new Request("https://example.com/boom"),
      { ...env, ENVIRONMENT: "production" },
      // deno-lint-ignore no-explicit-any
      { waitUntil: () => {}, passThroughOnException: () => {} } as any,
    );

    expect(res.status).toBe(500);
    expect(captureSpy).toHaveBeenCalledTimes(1);
    expect(captureSpy.mock.calls[0]?.[0]).toBeInstanceOf(Error);
  });
});
