export const REQUIRED_CONFIRMATION_PHRASE = "DELETE MY ACCOUNT";

export async function deleteAccount(confirmPhrase: string): Promise<void> {
  const res = await fetch("/api/v1/account", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirm: confirmPhrase }),
  });
  if (!res.ok) {
    throw new Error(`delete account failed: ${res.status}`);
  }
}

export type AccountProfile = {
  email: string;
  sessionExpiresAt: string | null;
  passkeyCount: number;
  hasGoogle: boolean;
  linkedEmails: string[];
};

export async function getAccountProfile(): Promise<AccountProfile> {
  const res = await fetch("/api/v1/account");
  if (!res.ok) {
    throw new Error(`get account profile failed: ${res.status}`);
  }
  return res.json();
}

export async function signOut(): Promise<void> {
  const res = await fetch("/api/v1/account/sign-out", { method: "POST" });
  if (!res.ok) {
    throw new Error(`sign out failed: ${res.status}`);
  }
}
