import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../../src/server/index";

// Constructs a request against the app directly with ENVIRONMENT overridden
// to "production", rather than relying on the pool's configured (dev) env —
// SELF.fetch always uses the wrangler.toml-configured environment, which
// can't be overridden per test.
describe("dev session routes are unreachable in production (FR-009)", () => {
  const prodEnv = { ...env, ENVIRONMENT: "production" as const };

  it("POST /_dev/session returns 404", async () => {
    const res = await app.fetch(
      new Request("https://example.com/api/v1/_dev/session", { method: "POST" }),
      prodEnv,
    );
    expect(res.status).toBe(404);
  });

  it("POST /_dev/session/invalidate returns 404", async () => {
    const res = await app.fetch(
      new Request("https://example.com/api/v1/_dev/session/invalidate", { method: "POST" }),
      prodEnv,
    );
    expect(res.status).toBe(404);
  });

  it("GET /_dev/magic-link-token returns 404, with or without an email query param", async () => {
    const withoutEmail = await app.fetch(
      new Request("https://example.com/api/v1/_dev/magic-link-token"),
      prodEnv,
    );
    expect(withoutEmail.status).toBe(404);

    const withEmail = await app.fetch(
      new Request("https://example.com/api/v1/_dev/magic-link-token?email=owner@example.com"),
      prodEnv,
    );
    expect(withEmail.status).toBe(404);
  });

  it("GET /_dev/oidc-google returns 404, with or without an email query param", async () => {
    const withoutEmail = await app.fetch(
      new Request("https://example.com/api/v1/_dev/oidc-google"),
      prodEnv,
    );
    expect(withoutEmail.status).toBe(404);

    const withEmail = await app.fetch(
      new Request("https://example.com/api/v1/_dev/oidc-google?email=owner@example.com"),
      prodEnv,
    );
    expect(withEmail.status).toBe(404);
  });
});
