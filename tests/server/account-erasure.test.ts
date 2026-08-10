import { env, SELF } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import { buildFixtureJpeg } from "./fixtures/jpeg";
import { attachmentKey } from "../../src/server/attachments/storage";
import { findMagicLinkTokenByEmail } from "../../src/server/db/repository";

// D1 storage in @cloudflare/vitest-pool-workers is isolated per test *file*, not per `it()` — each
// session below gets its own tenant, so tests never observe each other's data.

const REQUIRED_CONFIRMATION = "DELETE MY ACCOUNT";

function cookieValue(setCookie: string | null): string {
  if (!setCookie) throw new Error("missing Set-Cookie header");
  return setCookie.split(";")[0] ?? "";
}

function uniqueEmail(label: string): string {
  return `${label}-${crypto.randomUUID()}@example.invalid`;
}

async function createSession(
  email: string = uniqueEmail("account-erasure"),
): Promise<{ cookie: string; tenantId: string; userId: string; email: string }> {
  const res = await SELF.fetch("https://example.com/api/v1/_dev/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const body = (await res.json()) as { userId: string; tenantId: string };
  return { cookie: cookieValue(res.headers.get("set-cookie")), email, ...body };
}

async function createVehicleId(cookie: string): Promise<string> {
  const res = await SELF.fetch("https://example.com/api/v1/vehicles", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Test Vehicle", odometerUnit: "km" }),
  });
  const created = (await res.json()) as { id: string };
  return created.id;
}

async function createServiceRecordId(cookie: string, vehicleId: string): Promise<string> {
  const res = await SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/service-records`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ serviceDate: "2026-01-01", description: "Oil change" }),
  });
  const created = (await res.json()) as { id: string };
  return created.id;
}

async function createFuelRecordId(cookie: string, vehicleId: string): Promise<string> {
  const res = await SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/fuel-records`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      fuelDate: "2026-01-01",
      odometerReading: 1000,
      volume: 40,
      cost: 60,
    }),
  });
  const created = (await res.json()) as { id: string };
  return created.id;
}

async function uploadServiceAttachment(
  cookie: string,
  serviceRecordId: string,
): Promise<{ id: string }> {
  const res = await SELF.fetch(
    `https://example.com/api/v1/service-records/${serviceRecordId}/attachments`,
    {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "image/jpeg" },
      body: buildFixtureJpeg({ includeExif: false }),
    },
  );
  return (await res.json()) as { id: string };
}

async function uploadFuelAttachment(cookie: string, fuelRecordId: string): Promise<{ id: string }> {
  const res = await SELF.fetch(
    `https://example.com/api/v1/fuel-records/${fuelRecordId}/attachments`,
    {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "image/jpeg" },
      body: buildFixtureJpeg({ includeExif: false }),
    },
  );
  return (await res.json()) as { id: string };
}

async function createDocumentId(cookie: string, vehicleId: string): Promise<string> {
  const res = await SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/documents`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Registration", category: "registration" }),
  });
  const created = (await res.json()) as { id: string };
  return created.id;
}

async function uploadDocumentAttachment(
  cookie: string,
  documentId: string,
): Promise<{ id: string }> {
  const res = await SELF.fetch(
    `https://example.com/api/v1/documents/${documentId}/attachments`,
    {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "image/jpeg" },
      body: buildFixtureJpeg({ includeExif: false }),
    },
  );
  return (await res.json()) as { id: string };
}

function createReminderRule(cookie: string, vehicleId: string): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/reminder-rules`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      label: "Oil change",
      intervalDays: 180,
      lastDoneDate: "2026-01-01",
    }),
  });
}

function requestMagicLink(email: string): Promise<Response> {
  return SELF.fetch("https://example.com/api/v1/auth/magic-link/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

function deleteAccount(cookie: string, confirm?: unknown): Promise<Response> {
  const body: Record<string, unknown> = {};
  if (confirm !== undefined) body.confirm = confirm;
  return SELF.fetch("https://example.com/api/v1/account", {
    method: "DELETE",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function countRows(table: string, tenantId: string): Promise<number> {
  const row = await env.DB
    .prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE tenant_id = ?`)
    .bind(tenantId)
    .first<{ c: number }>();
  return row?.c ?? 0;
}

async function tenantExists(tenantId: string): Promise<boolean> {
  const row = await env.DB.prepare("SELECT id FROM tenants WHERE id = ?").bind(tenantId).first();
  return row !== null;
}

describe("account erasure — core erasure (User Story 1)", () => {
  it("removes every D1 row and every R2 object for a fully-populated account (SC-002, SC-003)", async () => {
    const { cookie, tenantId } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const serviceRecordId = await createServiceRecordId(cookie, vehicleId);
    const serviceAttachment = await uploadServiceAttachment(cookie, serviceRecordId);
    const fuelRecordId = await createFuelRecordId(cookie, vehicleId);
    const fuelAttachment = await uploadFuelAttachment(cookie, fuelRecordId);
    const documentId = await createDocumentId(cookie, vehicleId);
    const documentAttachment = await uploadDocumentAttachment(cookie, documentId);
    const reminderRes = await createReminderRule(cookie, vehicleId);
    expect(reminderRes.status).toBe(201);

    const serviceKey = attachmentKey(
      tenantId,
      "service-records",
      serviceRecordId,
      serviceAttachment.id,
    );
    const fuelKey = attachmentKey(tenantId, "fuel-records", fuelRecordId, fuelAttachment.id);
    const documentKey = attachmentKey(tenantId, "documents", documentId, documentAttachment.id);
    expect(await env.ATTACHMENTS.get(serviceKey)).not.toBeNull();
    expect(await env.ATTACHMENTS.get(fuelKey)).not.toBeNull();
    expect(await env.ATTACHMENTS.get(documentKey)).not.toBeNull();

    const res = await deleteAccount(cookie, REQUIRED_CONFIRMATION);
    expect(res.status).toBe(204);

    expect(await tenantExists(tenantId)).toBe(false);
    expect(await countRows("vehicles", tenantId)).toBe(0);
    expect(await countRows("service_records", tenantId)).toBe(0);
    expect(await countRows("service_record_attachments", tenantId)).toBe(0);
    expect(await countRows("fuel_records", tenantId)).toBe(0);
    expect(await countRows("fuel_record_attachments", tenantId)).toBe(0);
    expect(await countRows("documents", tenantId)).toBe(0);
    expect(await countRows("document_attachments", tenantId)).toBe(0);
    expect(await countRows("reminder_rules", tenantId)).toBe(0);
    expect(await env.ATTACHMENTS.get(serviceKey)).toBeNull();
    expect(await env.ATTACHMENTS.get(fuelKey)).toBeNull();
    expect(await env.ATTACHMENTS.get(documentKey)).toBeNull();
  });

  it("deletes successfully for an account with zero vehicles or records", async () => {
    const { cookie, tenantId } = await createSession();
    const res = await deleteAccount(cookie, REQUIRED_CONFIRMATION);
    expect(res.status).toBe(204);
    expect(await tenantExists(tenantId)).toBe(false);
  });

  it("removes an outstanding, unconsumed sign-in magic-link token for the account's email (FR-005)", async () => {
    const email = uniqueEmail("outstanding-link");
    const { cookie } = await createSession(email);

    const requestRes = await requestMagicLink(email);
    expect(requestRes.status).toBe(200);
    expect(await findMagicLinkTokenByEmail(env.DB, email)).not.toBeNull();

    const res = await deleteAccount(cookie, REQUIRED_CONFIRMATION);
    expect(res.status).toBe(204);

    expect(await findMagicLinkTokenByEmail(env.DB, email)).toBeNull();
  });

  it("never touches a second tenant's data (FR-009)", async () => {
    const first = await createSession();
    const firstVehicleId = await createVehicleId(first.cookie);

    const second = await createSession();
    const secondVehicleId = await createVehicleId(second.cookie);

    const res = await deleteAccount(first.cookie, REQUIRED_CONFIRMATION);
    expect(res.status).toBe(204);

    expect(await tenantExists(second.tenantId)).toBe(true);
    expect(await countRows("vehicles", second.tenantId)).toBe(1);

    const stillThere = await SELF.fetch(`https://example.com/api/v1/vehicles/${secondVehicleId}`, {
      headers: { Cookie: second.cookie },
    });
    expect(stillThere.status).toBe(200);
    void firstVehicleId;
  });

  it("refuses the former session's cookie identically to an unauthenticated request, even if it was cache-warm (FR-007, SC-005)", async () => {
    const { cookie } = await createSession();

    // Warm the KV cache-aside layer by resolving this session at least once before deletion —
    // otherwise this test wouldn't actually exercise the stale-cache gap research.md fixed.
    const warm = await SELF.fetch("https://example.com/api/v1/auth/whoami", {
      headers: { Cookie: cookie },
    });
    expect(warm.status).toBe(200);

    const del = await deleteAccount(cookie, REQUIRED_CONFIRMATION);
    expect(del.status).toBe(204);

    const afterDeletion = await SELF.fetch("https://example.com/api/v1/auth/whoami", {
      headers: { Cookie: cookie },
    });
    const unauthenticated = await SELF.fetch("https://example.com/api/v1/auth/whoami");
    expect(afterDeletion.status).toBe(401);
    expect(unauthenticated.status).toBe(401);
    expect(await afterDeletion.text()).toBe(await unauthenticated.text());
  });

  it("(FR-008 atomicity) leaves the account entirely intact if R2 cleanup fails before the D1 delete runs", async () => {
    const { cookie, tenantId } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const serviceRecordId = await createServiceRecordId(cookie, vehicleId);
    await uploadServiceAttachment(cookie, serviceRecordId);

    const deleteSpy = vi.spyOn(env.ATTACHMENTS, "delete").mockRejectedValueOnce(
      new Error("simulated R2 failure"),
    );
    try {
      const res = await deleteAccount(cookie, REQUIRED_CONFIRMATION);
      expect(res.status).toBeGreaterThanOrEqual(500);
    } finally {
      deleteSpy.mockRestore();
    }

    expect(await tenantExists(tenantId)).toBe(true);
    expect(await countRows("vehicles", tenantId)).toBe(1);
    expect(await countRows("service_records", tenantId)).toBe(1);

    const stillAuthenticated = await SELF.fetch("https://example.com/api/v1/auth/whoami", {
      headers: { Cookie: cookie },
    });
    expect(stillAuthenticated.status).toBe(200);
  });
});

describe("account erasure — confirmation gate (User Story 2)", () => {
  it("rejects a request with no confirm field and changes nothing", async () => {
    const { cookie, tenantId } = await createSession();
    const vehicleId = await createVehicleId(cookie);

    const res = await deleteAccount(cookie);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_request" });

    expect(await tenantExists(tenantId)).toBe(true);
    expect(await countRows("vehicles", tenantId)).toBe(1);
    void vehicleId;
  });

  it("rejects a confirm value that doesn't exactly match the required phrase", async () => {
    const { cookie, tenantId } = await createSession();

    const res = await deleteAccount(cookie, "delete my account");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_request" });
    expect(await tenantExists(tenantId)).toBe(true);
  });

  it("leaves the session fully usable after either rejection", async () => {
    const { cookie } = await createSession();

    await deleteAccount(cookie);
    await deleteAccount(cookie, "wrong phrase");

    const whoami = await SELF.fetch("https://example.com/api/v1/auth/whoami", {
      headers: { Cookie: cookie },
    });
    expect(whoami.status).toBe(200);
  });
});
