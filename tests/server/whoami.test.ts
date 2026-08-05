import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

function cookieValue(setCookie: string | null): string {
  if (!setCookie) throw new Error("missing Set-Cookie header");
  return setCookie.split(";")[0] ?? "";
}

describe("whoami", () => {
  it("resolves a valid session cookie to its userId/tenantId", async () => {
    const sessionRes = await SELF.fetch("https://example.com/api/v1/_dev/session", {
      method: "POST",
    });
    const { userId, tenantId } = (await sessionRes.json()) as {
      userId: string;
      tenantId: string;
    };
    const cookie = cookieValue(sessionRes.headers.get("set-cookie"));

    const res = await SELF.fetch("https://example.com/api/v1/auth/whoami", {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId, tenantId });
  });

  it("returns 401 without a session cookie", async () => {
    const res = await SELF.fetch("https://example.com/api/v1/auth/whoami");
    expect(res.status).toBe(401);
  });
});
