import { expect, test } from "@playwright/test";
import { useFreshNetwork } from "./helpers";

test("pages send security headers", async ({ request }) => {
  const res = await request.get("/login");
  const headers = res.headers();
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-powered-by"]).toBeUndefined();
});

test("repeated wrong passwords get locked out", async ({ page }) => {
  await useFreshNetwork(page);
  const email = `lockout-${Date.now()}-${test.info().project.name}@example.com`;
  await page.goto("/login");
  const alert = page.locator("form div[role=alert]");
  for (let i = 0; i < 10; i++) {
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(`wrong-password-${i}`);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(alert).toHaveText("Email or password is incorrect.");
    await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
  }
  await page.getByLabel("Password").fill("wrong-password-again");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(alert).toHaveText("Too many sign-in attempts. Wait 15 minutes and try again.");
});

test("too many sign-ups from one network are refused", async ({ page }) => {
  await useFreshNetwork(page);
  const register = async (n: number) => {
    await page.goto("/register");
    await page.getByLabel("Name").fill("Signup Flood");
    await page.getByLabel("Email").fill(`flood-${Date.now()}-${n}-${test.info().project.name}@example.com`);
    await page.getByLabel("Password").fill("flood-password-1");
    await page.getByRole("button", { name: "Create account" }).click();
  };
  for (let n = 0; n < 5; n++) {
    await register(n);
    await expect(page).toHaveURL(/\/board/);
    await page.context().clearCookies();
  }
  await register(5);
  await expect(page.locator("form div[role=alert]")).toHaveText("Too many sign-ups from this network. Try again in an hour.");
});

test("forms never put a password in the URL, even before JavaScript loads", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  for (const [path, button] of [["/login", "Sign in"], ["/register", "Create account"]] as const) {
    await page.goto(path);
    if (path === "/register") await page.getByLabel("Name").fill("No Script");
    await page.getByLabel("Email").fill("noscript@example.com");
    await page.getByLabel("Password").fill("secret-password-123");
    await page.getByRole("button", { name: button }).click({ force: true });
    await page.waitForLoadState();
    expect(page.url()).not.toContain("secret-password-123");
  }
  await context.close();
});
