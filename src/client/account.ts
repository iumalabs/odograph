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
