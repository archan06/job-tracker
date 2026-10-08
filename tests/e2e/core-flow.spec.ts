import { expect, test } from "@playwright/test";
import { signUpAndVerify, useFreshNetwork } from "./helpers";

test.beforeEach(async ({ page }) => useFreshNetwork(page));

test("register → create → board → change status → timeline", async ({ page }) => {
  const email = `e2e-${Date.now()}-${test.info().project.name}@example.com`;
  await signUpAndVerify(page, { name: "E2E", email, password: "e2e-password-123" });

  await page.goto("/applications/new");
  await page.getByLabel("Company", { exact: true }).fill("Playwright Inc");
  await page.getByLabel("Job title").fill("QA Engineer");
  await page.getByRole("button", { name: "Save application" }).click();
  await expect(page).toHaveURL(/\/applications\/(?!new)[^/]+$/);

  await page.goto("/board");
  await expect(page.getByTestId("column-SAVED").getByText("Playwright Inc")).toBeVisible();
  await page.getByTestId("column-SAVED").getByLabel("Status for Playwright Inc").selectOption("APPLIED");
  await expect(page.getByTestId("column-APPLIED").getByText("Playwright Inc")).toBeVisible();

  await page.getByTestId("column-APPLIED").getByText("Playwright Inc").click();
  await expect(page.getByText("Saved → Applied")).toBeVisible();
});

test("theme choice applies and persists", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/login");
  await page.getByRole("button", { name: "Theme" }).click();
  await page.getByRole("menuitemradio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
});
