import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

function uniqueEmail(label: string): string {
  return `${label}-${crypto.randomUUID()}@example.invalid`;
}

function signInFixture(email?: string): Promise<Response> {
  const url = new URL("https://example.com/api/v1/_dev/oidc-google");
  if (email !== undefined) url.searchParams.set("email", email);
  return SELF.fetch(url.toString(), { redirect: "manual" });
}

function cookieValue(setCookie: string | null): string {
  if (!setCookie) throw new Error("missing Set-Cookie header");
  return setCookie.split(";")[0] ?? "";
}

async function probeTenantId(cookie: string): Promise<string> {
  const res = await SELF.fetch("https://example.com/api/v1/vehicles", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "probe", odometerUnit: "km" }),
  });
  expect(res.status).toBe(201);
  const body = (await res.json()) as { tenantId: string };
  return body.tenantId;
}

describe("GET /api/v1/_dev/oidc-google (User Story 1)", () => {
  it("redirects to /?oidc=ok with a working session cookie (FR-001, FR-004)", async () => {
    const email = uniqueEmail("signin");
    const res = await signInFixture(email);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("oidc=ok");
    expect(res.headers.get("set-cookie")).toBeTruthy();
  });

  it("the issued cookie authenticates a real request (FR-003)", async () => {
    const email = uniqueEmail("session-usable");
    const res = await signInFixture(email);
    const cookie = cookieValue(res.headers.get("set-cookie"));

    const vehiclesRes = await SELF.fetch("https://example.com/api/v1/vehicles", {
      headers: { Cookie: cookie },
    });
    expect(vehiclesRes.status).toBe(200);
  });

  it("calling twice with the same email resolves the same account, not a duplicate (FR-002)", async () => {
    const email = uniqueEmail("repeat");
    const first = await signInFixture(email);
    const second = await signInFixture(email);

    const tenantA = await probeTenantId(cookieValue(first.headers.get("set-cookie")));
    const tenantB = await probeTenantId(cookieValue(second.headers.get("set-cookie")));
    expect(tenantB).toBe(tenantA);
  });

  it("rejects a request with no email query param, issuing no cookie (FR-007)", async () => {
    const res = await signInFixture();
    expect(res.status).toBe(400);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});
