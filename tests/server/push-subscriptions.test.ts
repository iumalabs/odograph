import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { evaluateAllReminders } from "../../src/server/db/repository";

// D1 storage in @cloudflare/vitest-pool-workers is isolated per test *file*, not per `it()` — each
// session below gets its own tenant, so tests never observe each other's data.

function cookieValue(setCookie: string | null): string {
  if (!setCookie) throw new Error("missing Set-Cookie header");
  return setCookie.split(";")[0] ?? "";
}

async function createSession(): Promise<{ cookie: string; tenantId: string }> {
  const res = await SELF.fetch("https://example.com/api/v1/_dev/session", { method: "POST" });
  const body = (await res.json()) as { tenantId: string };
  return { cookie: cookieValue(res.headers.get("set-cookie")), tenantId: body.tenantId };
}

// Reminder-notification tests need a real-looking, non-placeholder email or
// findDeliverableReminderRecipient silently skips the email channel (same fixture note as
// tests/server/reminder-rules.test.ts).
async function createDeliverableSession(): Promise<{ cookie: string; tenantId: string }> {
  const email = `owner-${crypto.randomUUID()}@example.com`;
  const res = await SELF.fetch("https://example.com/api/v1/_dev/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const body = (await res.json()) as { tenantId: string };
  return { cookie: cookieValue(res.headers.get("set-cookie")), tenantId: body.tenantId };
}

function subscribeReq(cookie: string, endpoint: string): Promise<Response> {
  return SELF.fetch("https://example.com/api/v1/push/subscriptions", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint, keys: { p256dh: "p256dh-value", auth: "auth-value" } }),
  });
}

function unsubscribeReq(cookie: string, endpoint: string): Promise<Response> {
  return SELF.fetch("https://example.com/api/v1/push/subscriptions", {
    method: "DELETE",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
}

function vapidPublicKeyReq(cookie?: string): Promise<Response> {
  return SELF.fetch("https://example.com/api/v1/push/vapid-public-key", {
    headers: cookie ? { Cookie: cookie } : {},
  });
}

async function subscriptionCountFor(tenantId: string): Promise<number> {
  const row = await env.DB
    .prepare("SELECT COUNT(*) AS count FROM push_subscriptions WHERE tenant_id = ?")
    .bind(tenantId)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

function createVehicleId(cookie: string): Promise<string> {
  return SELF.fetch("https://example.com/api/v1/vehicles", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Test Vehicle", odometerUnit: "km" }),
  }).then((res) => res.json()).then((body) => (body as { id: string }).id);
}

function createReminderRule(cookie: string, vehicleId: string): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/reminder-rules`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({
      label: "Test reminder",
      intervalDays: 100,
      lastDoneDate: isoDateDaysFromNow(-95),
    }),
  });
}

function isoDateDaysFromNow(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

describe("push subscriptions — subscribe/unsubscribe (User Story 1/2)", () => {
  it("subscribing stores a row for the tenant", async () => {
    const { cookie, tenantId } = await createSession();
    const res = await subscribeReq(cookie, "https://push.example.test/a");
    expect(res.status).toBe(201);
    expect(await subscriptionCountFor(tenantId)).toBe(1);
  });

  it("re-subscribing the same endpoint upserts rather than duplicating", async () => {
    const { cookie, tenantId } = await createSession();
    const endpoint = "https://push.example.test/b";
    await subscribeReq(cookie, endpoint);
    const second = await subscribeReq(cookie, endpoint);
    expect(second.status).toBe(201);
    expect(await subscriptionCountFor(tenantId)).toBe(1);
  });

  it("unsubscribing removes the row and is idempotent on a second call", async () => {
    const { cookie, tenantId } = await createSession();
    const endpoint = "https://push.example.test/c";
    await subscribeReq(cookie, endpoint);
    expect(await subscriptionCountFor(tenantId)).toBe(1);

    const first = await unsubscribeReq(cookie, endpoint);
    expect(first.status).toBe(204);
    expect(await subscriptionCountFor(tenantId)).toBe(0);

    const second = await unsubscribeReq(cookie, endpoint);
    expect(second.status).toBe(204);
  });

  it("a malformed subscription body is rejected and nothing is stored", async () => {
    const { cookie, tenantId } = await createSession();
    const res = await SELF.fetch("https://example.com/api/v1/push/subscriptions", {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: "https://push.example.test/d" }), // missing keys
    });
    expect(res.status).toBe(400);
    expect(await subscriptionCountFor(tenantId)).toBe(0);
  });

  it("a different tenant's subscriptions are isolated", async () => {
    const owner = await createSession();
    const other = await createSession();
    await subscribeReq(owner.cookie, "https://push.example.test/e");

    expect(await subscriptionCountFor(owner.tenantId)).toBe(1);
    expect(await subscriptionCountFor(other.tenantId)).toBe(0);

    // Unsubscribing an endpoint that belongs to a different tenant is a no-op (idempotent-delete
    // semantics, not a leak of "does this endpoint exist for someone else").
    const res = await unsubscribeReq(other.cookie, "https://push.example.test/e");
    expect(res.status).toBe(204);
    expect(await subscriptionCountFor(owner.tenantId)).toBe(1);
  });

  it("vapid-public-key requires a session", async () => {
    const res = await vapidPublicKeyReq();
    expect(res.status).toBe(401);
  });

  it("vapid-public-key reports unavailable when VAPID isn't configured (this test environment)", async () => {
    const { cookie } = await createSession();
    const res = await vapidPublicKeyReq(cookie);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "push_not_configured" });
  });
});

describe("evaluateAllReminders — push alongside email (spec 022 research.md)", () => {
  it("a due reminder still sends email normally when push is unconfigured, and the subscription is left untouched", async () => {
    const owner = await createDeliverableSession();
    const vehicleId = await createVehicleId(owner.cookie);
    const endpoint = "https://push.example.test/f";
    await subscribeReq(owner.cookie, endpoint);
    const rule = (await (await createReminderRule(owner.cookie, vehicleId))
      .json()) as { id: string };

    const result = await evaluateAllReminders(env);
    expect(result.notified).toBeGreaterThanOrEqual(1);

    const stillThere = await env.DB
      .prepare("SELECT id FROM push_subscriptions WHERE tenant_id = ? AND endpoint = ?")
      .bind(owner.tenantId, endpoint)
      .first();
    expect(stillThere).not.toBeNull();

    const notifiedRow = await env.DB
      .prepare("SELECT last_notified_severity AS s FROM reminder_rules WHERE id = ?")
      .bind(rule.id)
      .first<{ s: string | null }>();
    expect(notifiedRow?.s).not.toBeNull();
  });

  it("a due reminder with no deliverable email and no configured push is silently skipped, not counted as failed", async () => {
    const owner = await createSession(); // placeholder email — not deliverable
    const vehicleId = await createVehicleId(owner.cookie);
    await subscribeReq(owner.cookie, "https://push.example.test/g");
    const rule = (await (await createReminderRule(owner.cookie, vehicleId))
      .json()) as { id: string };

    await evaluateAllReminders(env);

    const row = await env.DB
      .prepare("SELECT last_notified_severity AS s FROM reminder_rules WHERE id = ?")
      .bind(rule.id)
      .first<{ s: string | null }>();
    expect(row?.s).toBeNull();
  });
});
