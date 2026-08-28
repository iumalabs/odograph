import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../../src/server/index";

// Mirrors csp.test.ts's ASSETS-mocking approach (see that file's own comment for why: dist/client
// isn't guaranteed to exist when this suite runs, and mocking isolates index.ts's own
// header-attachment logic from Cloudflare's static-asset serving, which isn't this project's code).
function mockAssets(response: Response): typeof env.ASSETS {
  return { fetch: () => Promise.resolve(response) } as unknown as typeof env.ASSETS;
}

function htmlResponse(): Response {
  return new Response("<!doctype html><html><body>ok</body></html>", {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

const previewEnv = { ...env, ENVIRONMENT: "preview" as const };

const EXPECTED = {
  "strict-transport-security": "max-age=63072000; includeSubDomains; preload",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), geolocation=(), microphone=()",
};

describe("static security headers (issue #286)", () => {
  it("attaches HSTS, X-Content-Type-Options, Referrer-Policy, and Permissions-Policy to an HTML response", async () => {
    const testEnv = { ...previewEnv, ASSETS: mockAssets(htmlResponse()) };
    const res = await app.fetch(new Request("https://example.com/"), testEnv);

    for (const [name, value] of Object.entries(EXPECTED)) {
      expect(res.headers.get(name)).toBe(value);
    }
  });

  it("attaches the same headers to an /api/v1/* response", async () => {
    const res = await app.fetch(
      new Request("https://example.com/api/v1/auth/whoami"),
      previewEnv,
    );

    for (const [name, value] of Object.entries(EXPECTED)) {
      expect(res.headers.get(name)).toBe(value);
    }
  });

  it("attaches the headers to an /api/v1/* response even in development (unlike CSP)", async () => {
    const devEnv = { ...env, ENVIRONMENT: "development" as const };
    const res = await app.fetch(new Request("https://example.com/api/v1/auth/whoami"), devEnv);

    for (const [name, value] of Object.entries(EXPECTED)) {
      expect(res.headers.get(name)).toBe(value);
    }
  });

  it("locks down camera even though the app's photo-capture feature exists", async () => {
    const res = await app.fetch(
      new Request("https://example.com/api/v1/auth/whoami"),
      previewEnv,
    );
    // The capture feature uses <input capture="environment">, the native file-picker attribute —
    // never the JS getUserMedia()/MediaDevices API, which is what Permissions-Policy's camera
    // directive actually gates. Nothing in this app needs a camera allowance.
    expect(res.headers.get("permissions-policy")).toContain("camera=()");
  });
});
