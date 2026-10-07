import { expect, test, type Page } from "@playwright/test";
import { useFreshNetwork } from "./helpers";

test.beforeEach(async ({ page }) => {
  await useFreshNetwork(page);
  const email = `e2e-ac-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${test.info().project.name}@example.com`;
  await page.goto("/register");
  await page.getByLabel("Name").fill("E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("e2e-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/board/);
});

const companyBox = (page: Page) => page.getByRole("combobox", { name: "Company", exact: true });

test("pick a company with the keyboard, save, and see its logo on the board", async ({ page }) => {
  await page.goto("/applications/new");
  const company = companyBox(page);
  await company.fill("stri");
  await expect(page.getByRole("option", { name: /Stripe/ })).toBeVisible();
  await company.press("ArrowDown");
  await company.press("Enter"); // picks; must not submit
  await expect(page).toHaveURL(/\/applications\/new$/);
  await expect(company).toHaveValue("Stripe");
  await expect(page.getByLabel("Company website")).toHaveValue("stripe.com");
  await page.getByLabel("Job title").fill("Engineer");
  await page.getByRole("button", { name: "Save application" }).click();
  await expect(page).toHaveURL(/\/applications\/(?!new)[^/]+$/);
  await page.goto("/board");
  await expect(page.getByTestId("column-SAVED").getByTestId("company-logo").first()).toHaveAttribute("data-domain", "stripe.com");
});

test("a typed company with no website saves as typed and shows initials", async ({ page }) => {
  await page.goto("/applications/new");
  await companyBox(page).fill("Tiny Startup");
  await page.getByLabel("Job title").fill("Engineer");
  await page.getByRole("button", { name: "Save application" }).click();
  await expect(page).toHaveURL(/\/applications\/(?!new)[^/]+$/);
  await page.goto("/board");
  const logo = page.getByTestId("column-SAVED").getByTestId("company-logo").first();
  await expect(logo).toHaveAttribute("data-domain", "");
  await expect(logo).toHaveText("TS");
});

test("an auto-filled website clears when the company changes; a typed one stays", async ({ page }) => {
  await page.goto("/applications/new");
  const company = companyBox(page);
  const website = page.getByLabel("Company website");
  await company.fill("stri");
  await page.getByRole("option", { name: /Stripe/ }).click();
  await expect(website).toHaveValue("stripe.com");
  await company.fill("Strip");
  await expect(website).toHaveValue("");
  await website.fill("acme.io");
  await company.fill("Acme");
  await expect(website).toHaveValue("acme.io");
});
