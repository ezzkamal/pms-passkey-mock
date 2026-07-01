import { expect, test } from "@playwright/test";

test("starts Keycloak sign-in before PMS workflows", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "Redirecting to Keycloak" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Payroll Runs" })).toBeDisabled();
});
