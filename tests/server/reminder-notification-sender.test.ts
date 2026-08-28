import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { sendReminderDueEmail } from "../../src/server/email/reminder-notification";

// Issue #285: reminder/expiry notification emails were sent from the same auth@ address used for
// magic-link sign-in emails, making the two indistinguishable at a glance in a user's inbox.

type CapturedEmail = { from: string };

function fakeEnv() {
  let captured: CapturedEmail | null = null;
  const fakeEnvValue = {
    ...env,
    EMAIL: {
      send: (message: { from: string }) => {
        captured = { from: message.from };
        return Promise.resolve();
      },
    },
  };
  return { env: fakeEnvValue, getCaptured: () => captured };
}

describe("sendReminderDueEmail sender address (issue #285)", () => {
  it("sends from a notification-specific address, distinct from magic-link's auth@ address", async () => {
    const { env: testEnv, getCaptured } = fakeEnv();
    // deno-lint-ignore no-explicit-any
    const result = await sendReminderDueEmail(testEnv as any, {
      to: "owner@example.invalid",
      vehicleName: "Test Vehicle",
      itemLabel: "Oil change",
      status: "overdue",
    });
    expect(result.sent).toBe(true);

    const captured = getCaptured();
    expect(captured?.from).toBe("notifications@odograph.iuma.dev");
    expect(captured?.from).not.toBe("auth@odograph.iuma.dev");
  });
});
