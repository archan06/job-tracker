import { expect, test, type Page } from "@playwright/test";
import { emailsTo, latestLinkFor, useFreshNetwork } from "./helpers";

const PASSWORD = "verify-password-1";
const address = () => `e2e-verify-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${test.info().project.name}@example.com`;

test.beforeEach(async ({ page }) => {
  await useFreshNetwork(page);
});

async function signUp(page: Page, email: string) {
  await page.goto("/register");
  await page.getByLabel("Name").fill("Verify");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
}

async function signIn(page: Page, email: string) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

test("sign up → check inbox → open link → sign in", async ({ page }) => {
  const email = address();
  await signUp(page, email);
  await expect(page).toHaveURL(/\/check-email/);
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();

  await page.goto(await latestLinkFor(email));
  await expect(page).toHaveURL(/\/login\?verified=1/);
  await expect(page.getByText("Email verified. Sign in to continue.")).toBeVisible();
  await signIn(page, email);
  await expect(page).toHaveURL(/\/board/);
});

test("an unverified sign-in shows the resend screen", async ({ page }) => {
  const email = address();
  await signUp(page, email);
  await expect(page).toHaveURL(/\/check-email/);
  expect(emailsTo(email)).toBe(1);

  await page.goto("/login");
  await signIn(page, email);
  await expect(page.getByText(/Verify your email first/)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
  await expect.poll(() => emailsTo(email)).toBe(2);
  await expect(page.getByRole("button", { name: "Resend email" })).toBeVisible();
});

test("an expired or unknown link offers a new one", async ({ page }) => {
  await page.goto("/verify-email?token=nope");
  await expect(page.getByRole("heading", { name: "This link has expired" })).toBeVisible();
  await page.getByLabel("Email").fill(address());
  await page.getByRole("button", { name: "Send a new link" }).click();
  await expect(page.getByText("If that account needs verifying, we've sent a new link")).toBeVisible();
});
