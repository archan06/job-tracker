import { expect, test } from "@playwright/test";
import { signUpAndVerify, useFreshNetwork } from "./helpers";

test.beforeEach(async ({ page }) => useFreshNetwork(page));

test("company search with a trailing space settles instead of re-querying", async ({ page }) => {
  await signUpAndVerify(page, { name: "Search Test", email: `search-${Date.now()}-${test.info().project.name}@example.com`, password: "search-password-1" });
  await page.goto("/applications/new");
  await page.getByLabel("Company", { exact: true }).fill("Playwright Inc");
  await page.getByLabel("Job title").fill("QA Engineer");
  await page.getByRole("button", { name: "Save application" }).click();
  await expect(page).toHaveURL(/\/applications\/(?!new)[^/]+$/);

  await page.goto("/applications");
  const search = page.getByPlaceholder("Search companies");
  const filters = page.getByRole("button", { name: /Filters/ });
  // Phones fold the filters away; a tap before hydration does nothing, so retry until the panel opens.
  await expect(page.getByRole("heading", { name: "Applications", level: 1 })).toBeVisible();
  await expect(async () => {
    if (!(await search.isVisible()) && (await filters.isVisible())) await filters.click({ timeout: 1000 });
    await expect(search).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 15_000 });
  await search.fill("Play ");
  await expect(page).toHaveURL(/company=Play$/);

  let requests = 0;
  page.on("request", (r) => {
    if (r.url().includes("/applications?company=")) requests++;
  });
  await page.waitForTimeout(2500);
  expect(requests).toBeLessThanOrEqual(1);
  await expect(search).toHaveValue("Play ");
});
