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

test("location quick picks: Remote, and Hybrid… followed by a city", async ({ page }) => {
  await page.goto("/applications/new");
  const location = page.getByRole("combobox", { name: "Location" });
  await location.focus();
  await expect(page.getByRole("option", { name: "Remote" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Hybrid…" })).toBeVisible();
  await expect(page.getByText("Powered by Geoapify")).toBeVisible();
  await page.getByRole("option", { name: "Remote" }).click();
  await expect(location).toHaveValue("Remote");

  await location.fill("");
  await page.getByRole("option", { name: "Hybrid…" }).click();
  await expect(location).toHaveValue("Hybrid · ");
  await expect(location).toBeFocused();
  await location.pressSequentially("tor");
  await page.getByRole("option", { name: "Toronto, ON, Canada" }).click();
  await expect(location).toHaveValue("Hybrid · Toronto, ON, Canada");

  await companyBox(page).fill("Acme");
  await page.getByLabel("Job title").fill("Engineer");
  await page.getByRole("button", { name: "Save application" }).click();
  await expect(page).toHaveURL(/\/applications\/(?!new)[^/]+$/);
  await expect(page.getByText("Hybrid · Toronto, ON, Canada")).toBeVisible();
});

test("a typed location without picking saves as typed", async ({ page }) => {
  await page.goto("/applications/new");
  await companyBox(page).fill("Acme");
  await page.getByLabel("Job title").fill("Engineer");
  await page.getByRole("combobox", { name: "Location" }).fill("Remote (US only)");
  await page.getByRole("button", { name: "Save application" }).click();
  await expect(page).toHaveURL(/\/applications\/(?!new)[^/]+$/);
  await expect(page.getByText("Remote (US only)")).toBeVisible();
});

test("a logo that fails to load shows initials, even if it fails before the page is interactive", async ({ page }) => {
  await page.goto("/applications/new");
  await companyBox(page).fill("stri");
  await page.getByRole("option", { name: /Stripe/ }).click();
  await page.getByLabel("Job title").fill("Engineer");
  await page.getByRole("button", { name: "Save application" }).click();
  await expect(page).toHaveURL(/\/applications\/(?!new)[^/]+$/);
  await page.route("https://img.logo.dev/**", (route) => route.fulfill({ status: 404, body: "" }));
  // Hold the page's JavaScript back so the image fails before React hydrates.
  await page.route("**/_next/static/chunks/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await page.reload();
  await expect(page.locator("h1").locator("xpath=../../..").getByTestId("company-logo")).toHaveText("S");
});

test("Enter while suggestions are open but none is highlighted closes the list instead of submitting", async ({ page }) => {
  await page.goto("/applications/new");
  await page.getByLabel("Job title").fill("Engineer");
  const company = companyBox(page);
  await company.fill("stri");
  await expect(page.getByRole("option", { name: /Stripe/ })).toBeVisible();
  await company.press("Enter");
  await expect(page.getByRole("option", { name: /Stripe/ })).toBeHidden();
  await expect(page).toHaveURL(/\/applications\/new$/);
  await expect(company).toHaveValue("stri");
  await company.press("Enter"); // list closed: now Enter submits
  await expect(page).toHaveURL(/\/applications\/(?!new)[^/]+$/);
});

test("typing after highlighting an option drops the highlight, so Enter keeps the typed text", async ({ page }) => {
  await page.goto("/applications/new");
  const company = companyBox(page);
  await company.fill("sho");
  await expect(page.getByRole("option", { name: /Shopify/ })).toBeVisible();
  await company.press("ArrowDown");
  await company.pressSequentially("p cart co");
  await company.press("Enter");
  await expect(company).toHaveValue("shop cart co");
  await expect(page).toHaveURL(/\/applications\/new$/);
});
