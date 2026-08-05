import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

function cookieHeader(setCookie: string | null): { value: string; attributes: string } {
  if (!setCookie) throw new Error("missing Set-Cookie header");
  const [value, ...attributes] = setCookie.split(";").map((part) => part.trim());
  return { value: value ?? "", attributes: attributes.join("; ").toLowerCase() };
}

describe("session (User Story 2)", () => {
  it("issues a cookie marked HttpOnly, Secure, and SameSite=Lax", async () => {
    const res = await SELF.fetch("https://example.com/api/v1/_dev/session", { method: "POST" });
    expect(res.status).toBe(200);

    const { attributes } = cookieHeader(res.headers.get("set-cookie"));
    expect(attributes).toContain("httponly");
    expect(attributes).toContain("secure");
    expect(attributes).toContain("samesite=lax");
  });

  it("resolves a valid session cookie to the correct tenant with no other credential", async () => {
    const createRes = await SELF.fetch("https://example.com/api/v1/_dev/session", {
      method: "POST",
    });
    const { tenantId } = (await createRes.json()) as { tenantId: string };
    const { value: cookie } = cookieHeader(createRes.headers.get("set-cookie"));

    const probeRes = await SELF.fetch("https://example.com/api/v1/vehicles", {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "probe", odometerUnit: "km" }),
    });
    expect(probeRes.status).toBe(201);
    const body = (await probeRes.json()) as { tenantId: string };
    expect(body.tenantId).toBe(tenantId);
  });

  it("treats a request using an invalidated session's cookie as anonymous", async () => {
    const createRes = await SELF.fetch("https://example.com/api/v1/_dev/session", {
      method: "POST",
    });
    const { value: cookie } = cookieHeader(createRes.headers.get("set-cookie"));

    const invalidateRes = await SELF.fetch(
      "https://example.com/api/v1/_dev/session/invalidate",
      { method: "POST", headers: { Cookie: cookie } },
    );
    expect(invalidateRes.status).toBe(200);

    const afterRes = await SELF.fetch(
      `https://example.com/api/v1/vehicles/${crypto.randomUUID()}`,
      { headers: { Cookie: cookie } },
    );
    expect(afterRes.status).toBe(401);

    // Invalidating an already-invalidated session is rejected, not silently
    // accepted a second time.
    const secondInvalidateRes = await SELF.fetch(
      "https://example.com/api/v1/_dev/session/invalidate",
      { method: "POST", headers: { Cookie: cookie } },
    );
    expect(secondInvalidateRes.status).toBe(401);
  });
});
