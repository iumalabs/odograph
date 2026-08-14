import { expect, test } from "../support/dev-session.ts";
import { goToView, t } from "../support/app.ts";

// Settings screen (spec 029) consolidates account-level controls that used to sit inline on the
// Garage screen: currency (035), API tokens (017), and GDPR account erasure (016) — none had
// dedicated e2e coverage before (only reachable through this one dedicated nav destination now).
test.describe("settings screen (spec 029)", () => {
  test.beforeEach(async ({ authedPage }) => {
    await goToView(authedPage, "settings");
  });

  test("changing the currency preference updates the select immediately", async ({ authedPage }) => {
    const select = authedPage.getByLabel(t("currencySettingLabel"));
    await expect(select).toHaveValue("USD");
    await select.selectOption("EUR");
    await expect(select).toHaveValue("EUR");
  });

  test.describe("API tokens (spec 017)", () => {
    test("creating a token shows the one-time secret, then it's gone from the list view", async ({ authedPage }) => {
      await authedPage.getByRole("button", { name: t("apiTokensToggle") }).click();
      await expect(authedPage.getByText(t("noApiTokensYet"))).toBeVisible();

      await authedPage.getByLabel(t("apiTokenLabelLabel")).fill("CI integration");
      await authedPage.getByLabel(t("apiTokenScopeLabel")).selectOption("write");
      await authedPage.getByRole("button", { name: t("createApiToken"), exact: true }).click();

      await expect(authedPage.getByText(t("apiTokenCreatedWarning"))).toBeVisible();
      const secretCode = authedPage.locator("code");
      await expect(secretCode).toBeVisible();
      const secret = await secretCode.textContent();
      expect(secret).toBeTruthy();

      await authedPage.getByRole("button", { name: t("apiTokenCreatedDone"), exact: true })
        .click();
      // The secret itself never appears again — only the label/scope/metadata row does. Scoped
      // to the row itself since the still-visible create form's own <select> also has a
      // "Read-write" <option>, colliding with a page-wide search for that text.
      await expect(authedPage.getByText(t("apiTokenCreatedWarning"))).toHaveCount(0);
      const tokenRow = authedPage.getByText("CI integration", { exact: true }).locator("..");
      await expect(tokenRow).toBeVisible();
      await expect(tokenRow.getByText(t("apiTokenScopeWrite"), { exact: true })).toBeVisible();
      await expect(authedPage.getByText(t("noApiTokensYet"))).toHaveCount(0);
    });

    test("revoking a token marks it revoked and removes the revoke action", async ({ authedPage }) => {
      await authedPage.getByRole("button", { name: t("apiTokensToggle") }).click();
      await authedPage.getByLabel(t("apiTokenLabelLabel")).fill("To be revoked");
      await authedPage.getByRole("button", { name: t("createApiToken"), exact: true }).click();
      await authedPage.getByRole("button", { name: t("apiTokenCreatedDone"), exact: true })
        .click();

      const row = authedPage.getByText("To be revoked", { exact: true }).locator("..");
      await row.getByRole("button", { name: t("revokeApiToken"), exact: true }).click();

      await expect(row.getByText(t("apiTokenRevoked"))).toBeVisible();
      await expect(row.getByRole("button", { name: t("revokeApiToken") })).toHaveCount(0);
    });

    test("the create button stays disabled until a label is typed", async ({ authedPage }) => {
      await authedPage.getByRole("button", { name: t("apiTokensToggle") }).click();
      await expect(
        authedPage.getByRole("button", { name: t("createApiToken"), exact: true }),
      ).toBeDisabled();
      await authedPage.getByLabel(t("apiTokenLabelLabel")).fill("x");
      await expect(
        authedPage.getByRole("button", { name: t("createApiToken"), exact: true }),
      ).toBeEnabled();
    });
  });

  test.describe("account deletion (spec 016, GDPR erasure)", () => {
    test("the confirm button stays disabled until the exact phrase is typed", async ({ authedPage }) => {
      await authedPage.getByRole("button", { name: t("deleteAccountToggle") }).click();
      const confirmButton = authedPage.getByRole("button", {
        name: t("deleteAccountConfirmButton"),
        exact: true,
      });
      await expect(confirmButton).toBeDisabled();

      await authedPage.getByLabel(
        t("deleteAccountConfirmPrompt", {
          phrase: "DELETE MY ACCOUNT",
        }),
        { exact: false },
      ).fill("delete my account");
      await expect(confirmButton).toBeDisabled(); // case-sensitive, must match exactly

      await authedPage.getByLabel(
        t("deleteAccountConfirmPrompt", {
          phrase: "DELETE MY ACCOUNT",
        }),
        { exact: false },
      ).fill("DELETE MY ACCOUNT");
      await expect(confirmButton).toBeEnabled();
    });

    test("cancelling collapses the confirmation form without deleting anything", async ({ authedPage }) => {
      await authedPage.getByRole("button", { name: t("deleteAccountToggle") }).click();
      await authedPage.getByRole("button", { name: t("deleteAccountCancel"), exact: true })
        .click();
      await expect(authedPage.getByRole("button", { name: t("deleteAccountToggle") }))
        .toBeVisible();
      // Still signed in — the settings screen, not the sign-out screen, is showing.
      await expect(authedPage.getByRole("heading", { name: t("settingsScreenHeading") }))
        .toBeVisible();
    });

    test("confirming deletion signs the user out (constitution: GDPR erasure)", async ({ authedPage }) => {
      await authedPage.getByRole("button", { name: t("deleteAccountToggle") }).click();
      await authedPage.getByLabel(
        t("deleteAccountConfirmPrompt", {
          phrase: "DELETE MY ACCOUNT",
        }),
        { exact: false },
      ).fill("DELETE MY ACCOUNT");
      await authedPage.getByRole("button", { name: t("deleteAccountConfirmButton"), exact: true })
        .click();

      await expect(authedPage.getByLabel(t("emailLabel"))).toBeVisible();
      await expect(
        authedPage.getByRole("button", { name: t("signUpWithPasskey") }),
      ).toBeVisible();
    });
  });
});
