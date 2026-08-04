import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { deleteUser } from "../../src/server/db/repository";

function cookieValue(setCookie: string | null): string {
  if (!setCookie) throw new Error("missing Set-Cookie header");
  return setCookie.split(";")[0] ?? "";
}

async function createSession(): Promise<{ cookie: string; userId: string; tenantId: string }> {
  const res = await SELF.fetch("https://example.com/api/v1/_dev/session", { method: "POST" });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { userId: string; tenantId: string };
  return { cookie: cookieValue(res.headers.get("set-cookie")), ...body };
}

describe("tenant isolation (User Story 1)", () => {
  it("denies access to another tenant's probe resource identically to a nonexistent id", async () => {
    const tenantA = await createSession();
    const tenantB = await createSession();

    const createRes = await SELF.fetch("https://example.com/api/v1/_tenant-isolation-probe", {
      method: "POST",
      headers: { Cookie: tenantA.cookie },
    });
    expect(createRes.status).toBe(200);
    const { id: resourceId } = (await createRes.json()) as { id: string };

    const crossTenantRes = await SELF.fetch(
      `https://example.com/api/v1/_tenant-isolation-probe/${resourceId}`,
      { headers: { Cookie: tenantB.cookie } },
    );
    const madeUpRes = await SELF.fetch(
      `https://example.com/api/v1/_tenant-isolation-probe/${crypto.randomUUID()}`,
      { headers: { Cookie: tenantB.cookie } },
    );

    expect(crossTenantRes.status).toBe(404);
    expect(madeUpRes.status).toBe(404);
    expect(await crossTenantRes.text()).toBe(await madeUpRes.text());

    // Sanity check: the owning tenant CAN read its own resource.
    const ownRes = await SELF.fetch(
      `https://example.com/api/v1/_tenant-isolation-probe/${resourceId}`,
      { headers: { Cookie: tenantA.cookie } },
    );
    expect(ownRes.status).toBe(200);
  });

  it("ignores a client-supplied tenant/owner identifier", async () => {
    const tenantA = await createSession();

    const res = await SELF.fetch("https://example.com/api/v1/_tenant-isolation-probe", {
      method: "POST",
      headers: { Cookie: tenantA.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: "attacker-supplied-tenant-id", ownerId: "someone-else" }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { tenantId: string };
    expect(body.tenantId).toBe(tenantA.tenantId);
  });

  it("rejects an anonymous request before touching tenant data", async () => {
    const res = await SELF.fetch(
      `https://example.com/api/v1/_tenant-isolation-probe/${crypto.randomUUID()}`,
    );
    expect(res.status).toBe(401);
  });

  it("treats a session for a deleted user as invalid (FR-008)", async () => {
    const tenantA = await createSession();

    await deleteUser(env.DB, tenantA.userId);

    const res = await SELF.fetch(
      `https://example.com/api/v1/_tenant-isolation-probe/${crypto.randomUUID()}`,
      { headers: { Cookie: tenantA.cookie } },
    );
    expect(res.status).toBe(401);
  });
});
