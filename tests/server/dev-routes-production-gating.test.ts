import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../../src/server/index";

// Constructs a request against the app directly with ENVIRONMENT overridden,
// rather than relying on the pool's configured (dev) env — SELF.fetch always
// uses the wrangler.toml-configured environment, which can't be overridden
// per test. Covers both non-development environments (allow-list gating,
// security audit finding 2026-08-13: "preview" was previously reachable
// because the original check only denied "production" by name).
describe.each(["production", "preview"] as const)(
  "dev session routes are unreachable outside development: ENVIRONMENT=%s (FR-009)",
  (environment) => {
    const nonDevEnv = { ...env, ENVIRONMENT: environment };

    it("POST /_dev/session returns 404", async () => {
      const res = await app.fetch(
        new Request("https://example.com/api/v1/_dev/session", { method: "POST" }),
        nonDevEnv,
      );
      expect(res.status).toBe(404);
    });

    it("POST /_dev/session/invalidate returns 404", async () => {
      const res = await app.fetch(
        new Request("https://example.com/api/v1/_dev/session/invalidate", { method: "POST" }),
        nonDevEnv,
      );
      expect(res.status).toBe(404);
    });

    it("GET /_dev/magic-link-token returns 404, with or without an email query param", async () => {
      const withoutEmail = await app.fetch(
        new Request("https://example.com/api/v1/_dev/magic-link-token"),
        nonDevEnv,
      );
      expect(withoutEmail.status).toBe(404);

      const withEmail = await app.fetch(
        new Request("https://example.com/api/v1/_dev/magic-link-token?email=owner@example.com"),
        nonDevEnv,
      );
      expect(withEmail.status).toBe(404);
    });

    it("GET /_dev/oidc-google returns 404, with or without an email query param", async () => {
      const withoutEmail = await app.fetch(
        new Request("https://example.com/api/v1/_dev/oidc-google"),
        nonDevEnv,
      );
      expect(withoutEmail.status).toBe(404);

      const withEmail = await app.fetch(
        new Request("https://example.com/api/v1/_dev/oidc-google?email=owner@example.com"),
        nonDevEnv,
      );
      expect(withEmail.status).toBe(404);
    });
  },
);
