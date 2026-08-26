import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { sendMagicLinkEmail } from "../../src/server/auth/magic-link";

// odograph.dev and odograph.iuma.dev both route to the same production Worker during the domain
// migration (wrangler.toml's env.production.routes comment). A magic-link request submitted from
// either domain must produce an email pointing at the canonical odograph.iuma.dev domain in
// production — never back at the old one, regardless of which domain the request itself arrived
// on. Preview/development must keep using the request's own origin unchanged, since preview has
// no fixed custom domain at all.

type CapturedEmail = { html: string; text: string };

function fakeEnv(environment: "development" | "preview" | "production") {
  let captured: CapturedEmail | null = null;
  const fakeEnvValue = {
    ...env,
    ENVIRONMENT: environment,
    EMAIL: {
      send: (message: { html: string; text: string }) => {
        captured = { html: message.html, text: message.text };
        return Promise.resolve();
      },
    },
  };
  return { env: fakeEnvValue, getCaptured: () => captured };
}

describe("sendMagicLinkEmail domain pinning (production incident report, 2026-08-26)", () => {
  it("pins the verify link and INSTANCE field to odograph.iuma.dev in production, even when the request arrived on odograph.dev", async () => {
    const { env: prodEnv, getCaptured } = fakeEnv("production");
    // deno-lint-ignore no-explicit-any
    const result = await sendMagicLinkEmail(prodEnv as any, {
      email: "incident-check@example.invalid",
      token: "test-token",
      requestUrl: "https://odograph.dev/api/v1/auth/magic-link/request",
      purpose: "new-account",
    });
    expect(result.sent).toBe(true);

    const captured = getCaptured();
    expect(captured).not.toBeNull();
    expect(captured?.html).toContain("https://odograph.iuma.dev/api/v1/auth/magic-link/verify");
    expect(captured?.html).not.toContain("odograph.dev/api/v1/auth/magic-link/verify");
    expect(captured?.text).toContain("https://odograph.iuma.dev/api/v1/auth/magic-link/verify");
    expect(captured?.html).toContain("odograph.iuma.dev");
  });

  it("also pins when the request arrived on odograph.iuma.dev itself (no behavior change for the already-correct case)", async () => {
    const { env: prodEnv, getCaptured } = fakeEnv("production");
    // deno-lint-ignore no-explicit-any
    await sendMagicLinkEmail(prodEnv as any, {
      email: "already-correct@example.invalid",
      token: "test-token-2",
      requestUrl: "https://odograph.iuma.dev/api/v1/auth/magic-link/request",
      purpose: "sign-in",
    });
    const captured = getCaptured();
    expect(captured?.html).toContain("https://odograph.iuma.dev/api/v1/auth/magic-link/verify");
  });

  it("does NOT pin in development or preview — keeps using the request's own origin unchanged", async () => {
    for (const environment of ["development", "preview"] as const) {
      const { env: nonProdEnv, getCaptured } = fakeEnv(environment);
      // deno-lint-ignore no-explicit-any
      await sendMagicLinkEmail(nonProdEnv as any, {
        email: `${environment}-check@example.invalid`,
        token: "test-token-3",
        requestUrl: "https://pr-42-odograph-preview.kgz.workers.dev/api/v1/auth/magic-link/request",
        purpose: "sign-in",
      });
      const captured = getCaptured();
      expect(captured?.html).toContain(
        "https://pr-42-odograph-preview.kgz.workers.dev/api/v1/auth/magic-link/verify",
      );
      expect(captured?.html).not.toContain("odograph.iuma.dev");
    }
  });
});
