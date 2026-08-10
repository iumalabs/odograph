import {
  createExecutionContext,
  createScheduledController,
  env,
  SELF,
  waitOnExecutionContext,
} from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../../src/server/index";
import { evaluateAllDocumentReminders } from "../../src/server/db/repository";

function cookieValue(setCookie: string | null): string {
  if (!setCookie) throw new Error("missing Set-Cookie header");
  return setCookie.split(";")[0] ?? "";
}

async function createSession(): Promise<{ cookie: string; tenantId: string; userId: string }> {
  const res = await SELF.fetch("https://example.com/api/v1/_dev/session", { method: "POST" });
  const body = (await res.json()) as { tenantId: string; userId: string };
  return {
    cookie: cookieValue(res.headers.get("set-cookie")),
    tenantId: body.tenantId,
    userId: body.userId,
  };
}

// The default createSession() above leaves the email unset (a placeholder), which
// findDeliverableReminderRecipient is built to skip — every notify-path test needs a session with
// a real-looking, non-placeholder email instead, same reasoning as reminder-rules.test.ts.
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

async function createVehicleId(cookie: string): Promise<string> {
  const res = await SELF.fetch("https://example.com/api/v1/vehicles", {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Test Vehicle", odometerUnit: "km" }),
  });
  const created = (await res.json()) as { id: string };
  return created.id;
}

function deleteVehicleReq(cookie: string, id: string): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicles/${id}`, {
    method: "DELETE",
    headers: { Cookie: cookie },
  });
}

type DocumentBody = {
  title?: unknown;
  category?: unknown;
  expiryDate?: unknown;
  notes?: unknown;
};

function createDocumentReq(
  cookie: string,
  vehicleId: string,
  body: DocumentBody,
): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/vehicles/${vehicleId}/documents`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function createDocumentId(
  cookie: string,
  vehicleId: string,
  body: DocumentBody = {},
): Promise<string> {
  const res = await createDocumentReq(cookie, vehicleId, {
    title: "Test document",
    category: "registration",
    ...body,
  });
  const created = (await res.json()) as { id: string };
  return created.id;
}

function getDocument(cookie: string, id: string): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/documents/${id}`, {
    headers: { Cookie: cookie },
  });
}

function patchDocument(cookie: string, id: string, body: DocumentBody): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/documents/${id}`, {
    method: "PATCH",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteDocumentReq(cookie: string, id: string): Promise<Response> {
  return SELF.fetch(`https://example.com/api/v1/documents/${id}`, {
    method: "DELETE",
    headers: { Cookie: cookie },
  });
}

async function lastNotifiedSeverityOf(id: string): Promise<string | null> {
  const row = await env.DB
    .prepare("SELECT last_notified_severity AS lastNotifiedSeverity FROM documents WHERE id = ?")
    .bind(id)
    .first<{ lastNotifiedSeverity: string | null }>();
  return row?.lastNotifiedSeverity ?? null;
}

function isoDateDaysFromNow(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

describe("document reminder status (User Story 1)", () => {
  it("reads on_track for an expiry date well in the future", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const id = await createDocumentId(cookie, vehicleId, { expiryDate: isoDateDaysFromNow(45) });

    const body = (await (await getDocument(cookie, id)).json()) as { reminderStatus: string };
    expect(body.reminderStatus).toBe("on_track");
  });

  it("reads coming_up for an expiry date inside the 30-day window", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const id = await createDocumentId(cookie, vehicleId, { expiryDate: isoDateDaysFromNow(10) });

    const body = (await (await getDocument(cookie, id)).json()) as { reminderStatus: string };
    expect(body.reminderStatus).toBe("coming_up");
  });

  it("reads overdue for an expiry date already in the past", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const id = await createDocumentId(cookie, vehicleId, { expiryDate: isoDateDaysFromNow(-5) });

    const body = (await (await getDocument(cookie, id)).json()) as { reminderStatus: string };
    expect(body.reminderStatus).toBe("overdue");
  });

  it("reads reminderStatus null for a document with no expiry date (FR-002)", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const id = await createDocumentId(cookie, vehicleId);

    const body = (await (await getDocument(cookie, id)).json()) as {
      reminderStatus: string | null;
    };
    expect(body.reminderStatus).toBeNull();
  });
});

describe("email/push notification on escalation (User Story 2)", () => {
  it("notifies once when a document first becomes coming_up", async () => {
    const owner = await createDeliverableSession();
    const vehicleId = await createVehicleId(owner.cookie);
    const id = await createDocumentId(owner.cookie, vehicleId, {
      title: "Coming up",
      expiryDate: isoDateDaysFromNow(10),
    });

    const result = await evaluateAllDocumentReminders(env);
    expect(result.notified).toBe(1);
    expect(await lastNotifiedSeverityOf(id)).toBe("coming_up");
  });

  it("notifies directly at overdue without requiring a coming_up step first", async () => {
    const owner = await createDeliverableSession();
    const vehicleId = await createVehicleId(owner.cookie);
    const id = await createDocumentId(owner.cookie, vehicleId, {
      title: "Overdue",
      expiryDate: isoDateDaysFromNow(-5),
    });

    const result = await evaluateAllDocumentReminders(env);
    expect(result.notified).toBe(1);
    expect(await lastNotifiedSeverityOf(id)).toBe("overdue");
  });

  it("does not notify again while a document stays overdue", async () => {
    const owner = await createDeliverableSession();
    const vehicleId = await createVehicleId(owner.cookie);
    const id = await createDocumentId(owner.cookie, vehicleId, {
      title: "Stays overdue",
      expiryDate: isoDateDaysFromNow(-5),
    });

    const first = await evaluateAllDocumentReminders(env);
    expect(first.notified).toBe(1);

    const second = await evaluateAllDocumentReminders(env);
    expect(second.notified).toBe(0);
    expect(await lastNotifiedSeverityOf(id)).toBe("overdue");
  });

  it("does not notify again while a document stays coming_up", async () => {
    const owner = await createDeliverableSession();
    const vehicleId = await createVehicleId(owner.cookie);
    const id = await createDocumentId(owner.cookie, vehicleId, {
      title: "Stays coming up",
      expiryDate: isoDateDaysFromNow(10),
    });

    const first = await evaluateAllDocumentReminders(env);
    expect(first.notified).toBe(1);

    const second = await evaluateAllDocumentReminders(env);
    expect(second.notified).toBe(0);
    expect(await lastNotifiedSeverityOf(id)).toBe("coming_up");
  });
});

describe("owners without a deliverable channel (User Story 2)", () => {
  it("skips a placeholder-only account without erroring, and does not block the rest of the sweep", async () => {
    const placeholderOwner = await createSession();
    const placeholderVehicleId = await createVehicleId(placeholderOwner.cookie);
    const placeholderId = await createDocumentId(placeholderOwner.cookie, placeholderVehicleId, {
      title: "No deliverable email",
      expiryDate: isoDateDaysFromNow(-5),
    });

    const deliverableOwner = await createDeliverableSession();
    const deliverableVehicleId = await createVehicleId(deliverableOwner.cookie);
    const deliverableId = await createDocumentId(deliverableOwner.cookie, deliverableVehicleId, {
      title: "Has deliverable email",
      expiryDate: isoDateDaysFromNow(-5),
    });

    const result = await evaluateAllDocumentReminders(env);

    expect(await lastNotifiedSeverityOf(placeholderId)).toBeNull();
    expect(await lastNotifiedSeverityOf(deliverableId)).toBe("overdue");
    expect(result.notified).toBeGreaterThanOrEqual(1);
  });
});

describe("deletion stops evaluation, and notifications stay tenant-scoped (speckit-analyze finding C1)", () => {
  it("a deleted document is no longer evaluated or notified about", async () => {
    const owner = await createDeliverableSession();
    const vehicleId = await createVehicleId(owner.cookie);
    const id = await createDocumentId(owner.cookie, vehicleId, {
      title: "Will be deleted",
      expiryDate: isoDateDaysFromNow(-5),
    });

    const del = await deleteDocumentReq(owner.cookie, id);
    expect(del.status).toBe(204);

    const result = await evaluateAllDocumentReminders(env);
    expect(result.notified).toBe(0);
    expect(await lastNotifiedSeverityOf(id)).toBeNull();
  });

  it("a document whose vehicle was deleted is no longer evaluated or notified about", async () => {
    const owner = await createDeliverableSession();
    const vehicleId = await createVehicleId(owner.cookie);
    const id = await createDocumentId(owner.cookie, vehicleId, {
      title: "Vehicle will be deleted",
      expiryDate: isoDateDaysFromNow(-5),
    });

    const del = await deleteVehicleReq(owner.cookie, vehicleId);
    expect(del.status).toBe(204);

    const result = await evaluateAllDocumentReminders(env);
    expect(result.notified).toBe(0);
    expect(await lastNotifiedSeverityOf(id)).toBeNull();
  });

  it("notifies each tenant only for their own overdue document, never the other's (FR-009)", async () => {
    const tenantA = await createDeliverableSession();
    const tenantB = await createDeliverableSession();
    const vehicleA = await createVehicleId(tenantA.cookie);
    const vehicleB = await createVehicleId(tenantB.cookie);

    const docA = await createDocumentId(tenantA.cookie, vehicleA, {
      title: "Tenant A's document",
      expiryDate: isoDateDaysFromNow(-5),
    });
    const docB = await createDocumentId(tenantB.cookie, vehicleB, {
      title: "Tenant B's document",
      expiryDate: isoDateDaysFromNow(-5),
    });

    const result = await evaluateAllDocumentReminders(env);
    expect(result.notified).toBe(2);
    expect(await lastNotifiedSeverityOf(docA)).toBe("overdue");
    expect(await lastNotifiedSeverityOf(docB)).toBe("overdue");
  });
});

describe("renewing a document clears its reminder state (User Story 3)", () => {
  it("clears last_notified_severity and recomputes reminderStatus when expiryDate is edited forward", async () => {
    const owner = await createDeliverableSession();
    const vehicleId = await createVehicleId(owner.cookie);
    const id = await createDocumentId(owner.cookie, vehicleId, {
      title: "Renewed",
      expiryDate: isoDateDaysFromNow(-5),
    });

    await evaluateAllDocumentReminders(env);
    expect(await lastNotifiedSeverityOf(id)).toBe("overdue");

    const patched = await patchDocument(owner.cookie, id, { expiryDate: isoDateDaysFromNow(100) });
    expect(patched.status).toBe(200);
    const patchedBody = (await patched.json()) as { reminderStatus: string };
    expect(patchedBody.reminderStatus).toBe("on_track");
    expect(await lastNotifiedSeverityOf(id)).toBeNull();
  });

  it("notifies again once the renewed expiry date later re-enters the coming-up window", async () => {
    const owner = await createDeliverableSession();
    const vehicleId = await createVehicleId(owner.cookie);
    const id = await createDocumentId(owner.cookie, vehicleId, {
      title: "Renewed then due again",
      expiryDate: isoDateDaysFromNow(-5),
    });

    await evaluateAllDocumentReminders(env);
    await patchDocument(owner.cookie, id, { expiryDate: isoDateDaysFromNow(10) });

    const result = await evaluateAllDocumentReminders(env);
    expect(result.notified).toBe(1);
    expect(await lastNotifiedSeverityOf(id)).toBe("coming_up");
  });

  it("clearing expiryDate to null also clears last_notified_severity", async () => {
    const owner = await createDeliverableSession();
    const vehicleId = await createVehicleId(owner.cookie);
    const id = await createDocumentId(owner.cookie, vehicleId, {
      title: "Cleared",
      expiryDate: isoDateDaysFromNow(-5),
    });

    await evaluateAllDocumentReminders(env);
    expect(await lastNotifiedSeverityOf(id)).toBe("overdue");

    const patched = await patchDocument(owner.cookie, id, { expiryDate: null });
    const patchedBody = (await patched.json()) as { reminderStatus: string | null };
    expect(patchedBody.reminderStatus).toBeNull();
    expect(await lastNotifiedSeverityOf(id)).toBeNull();

    const result = await evaluateAllDocumentReminders(env);
    expect(result.notified).toBe(0);
  });
});

describe("Cron scheduling wiring", () => {
  it("the scheduled handler evaluates documents alongside reminder rules", async () => {
    const { cookie } = await createSession();
    const vehicleId = await createVehicleId(cookie);
    const id = await createDocumentId(cookie, vehicleId, { expiryDate: isoDateDaysFromNow(-5) });

    const ctx = createExecutionContext();
    await worker.scheduled(createScheduledController(), env, ctx);
    await waitOnExecutionContext(ctx);

    const cached = await env.DB
      .prepare(
        "SELECT cached_status AS cachedStatus, last_evaluated_at AS lastEvaluatedAt FROM documents WHERE id = ?",
      )
      .bind(id)
      .first<{ cachedStatus: string; lastEvaluatedAt: string | null }>();
    expect(cached?.cachedStatus).toBe("overdue");
    expect(cached?.lastEvaluatedAt).not.toBeNull();
  });
});
