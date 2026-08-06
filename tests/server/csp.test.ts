import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../../src/server/index";

// env.ASSETS is mocked here rather than relying on a real `deno task build` output existing —
// deno task test runs before deno task build in every CI workflow (ci.yml, deploy-preview.yml),
// so dist/client is never guaranteed to exist when this suite runs. Mocking also isolates what
// this suite actually owns (index.ts's header-attachment logic) from Cloudflare's own static-asset
// serving behavior, which isn't this project's code to test.
function mockAssets(response: Response): typeof env.ASSETS {
  return { fetch: () => Promise.resolve(response) } as unknown as typeof env.ASSETS;
}

function htmlResponse(): Response {
  return new Response("<!doctype html><html><body>ok</body></html>", {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

// CSP is only attached outside "development" — deno task dev's Vite dev server injects its own
// un-nonced inline script (the React Fast Refresh preamble), which a strict CSP correctly blocks,
// breaking local iteration for no security benefit (nothing to protect from in local dev). Only
// preview/production ever serve the pre-built dist/client (zero inline scripts, research.md), so
// every "does the header apply" test below runs against a "preview" env.
const previewEnv = { ...env, ENVIRONMENT: "preview" as const };

describe("Content-Security-Policy header (spec 015)", () => {
  it("attaches a strict, nonce-based policy to an HTML response", async () => {
    const testEnv = { ...previewEnv, ASSETS: mockAssets(htmlResponse()) };
    const res = await app.fetch(new Request("https://example.com/"), testEnv);

    const csp = res.headers.get("content-security-policy");
    expect(csp).not.toBeNull();
    expect(csp).toMatch(/^default-src 'self'; /);
    expect(csp).toContain("img-src 'self'");
    expect(csp).toContain("font-src 'self'");
    expect(csp).toContain("object-src 'none'");

    const nonceMatch = csp?.match(/script-src 'self' 'nonce-([^']+)'/);
    expect(nonceMatch).not.toBeNull();
    const nonce = nonceMatch?.[1] ?? "";
    expect(nonce.length).toBeGreaterThan(0);

    // Same nonce in both script-src and style-src (contracts/csp-policy.md); no wildcard or
    // unsafe-inline anywhere in either directive.
    expect(csp).toContain(`style-src 'self' 'nonce-${nonce}'`);
    expect(csp).not.toContain("*");
    expect(csp).not.toContain("unsafe-inline");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("generates a different nonce on every request", async () => {
    const testEnv = { ...previewEnv, ASSETS: mockAssets(htmlResponse()) };
    const first = await app.fetch(new Request("https://example.com/"), testEnv);
    const second = await app.fetch(new Request("https://example.com/"), testEnv);

    const nonceOf = (res: Response) =>
      res.headers.get("content-security-policy")?.match(/'nonce-([^']+)'/)?.[1];
    expect(nonceOf(first)).not.toBe(nonceOf(second));
  });

  it("does not attach the header to a non-HTML asset response, and passes it through unmodified", async () => {
    const jsResponse = new Response("console.log('hi');", {
      headers: { "content-type": "application/javascript; charset=utf-8" },
    });
    const testEnv = { ...previewEnv, ASSETS: mockAssets(jsResponse) };
    const res = await app.fetch(new Request("https://example.com/assets/index.js"), testEnv);

    expect(res.headers.get("content-security-policy")).toBeNull();
    expect(await res.text()).toBe("console.log('hi');");
  });

  it("does not attach the header to an /api/v1/* response, and never calls ASSETS for it", async () => {
    let assetsFetchCalled = false;
    const testEnv = {
      ...previewEnv,
      ASSETS: {
        fetch: () => {
          assetsFetchCalled = true;
          return Promise.resolve(new Response("should not be called"));
        },
      } as unknown as typeof env.ASSETS,
    };

    const res = await app.fetch(new Request("https://example.com/api/v1/auth/whoami"), testEnv);

    expect(res.headers.get("content-security-policy")).toBeNull();
    expect(assetsFetchCalled).toBe(false);
  });

  it("is skipped entirely in the development environment (local dev tooling compatibility)", async () => {
    const devEnv = {
      ...env,
      ENVIRONMENT: "development" as const,
      ASSETS: mockAssets(htmlResponse()),
    };
    const res = await app.fetch(new Request("https://example.com/"), devEnv);

    expect(res.headers.get("content-security-policy")).toBeNull();
    expect(await res.text()).toContain("<!doctype html>");
  });
});
