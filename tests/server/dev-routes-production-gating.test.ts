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
});
