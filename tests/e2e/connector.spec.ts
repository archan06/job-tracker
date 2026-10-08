import { createHash, randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { useFreshNetwork } from "./helpers";

const REDIRECT = "https://client.example/callback";

async function registerUser(page: Page) {
  const email = `e2e-mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${test.info().project.name}@example.com`;
  await page.goto("/register");
  await page.getByLabel("Name").fill("E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("e2e-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/board/);
  return email;
}

async function authorizeUrl(page: Page) {
  const reg = await page.request.post("/oauth/register", { data: { client_name: "Test Assistant", redirect_uris: [REDIRECT] } });
  expect(reg.status()).toBe(201);
  const { client_id } = await reg.json();
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const url = `/oauth/authorize?${new URLSearchParams({
    response_type: "code", client_id, redirect_uri: REDIRECT, code_challenge: challenge,
    code_challenge_method: "S256", state: "st4te", scope: "applications:read applications:write",
  })}`;
  return { url, client_id, verifier };
}

test.beforeEach(async ({ page }) => {
  await useFreshNetwork(page);
  // The "app" being connected: just catch where Landed sends the browser.
  await page.route("https://client.example/**", (route) => route.fulfill({ status: 200, body: "client callback" }));
});

test("signed out: sign in, see consent, Allow, and land back on the app with a code", async ({ page }) => {
  const email = await registerUser(page);
  await page.context().clearCookies();
  const { url, client_id, verifier } = await authorizeUrl(page);
  await page.goto(url);
  await expect(page).toHaveURL(/\/login\?callbackUrl=/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("e2e-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: /Test Assistant/ })).toBeVisible();
  await expect(page.getByText("View your applications")).toBeVisible();
  await expect(page.getByText("Add and update applications")).toBeVisible();
  await expect(page.getByText(/Unverified app/)).toBeVisible();
  await expect(page.getByText("client.example")).toBeVisible();
  await page.getByRole("button", { name: "Allow" }).click();

  await page.waitForURL(/^https:\/\/client\.example\/callback/);
  const back = new URL(page.url());
  expect(back.searchParams.get("state")).toBe("st4te");
  expect(back.searchParams.get("iss")).toBeTruthy();
  const code = back.searchParams.get("code")!;
  const tokenRes = await page.request.post("/oauth/token", {
    form: { grant_type: "authorization_code", code, client_id, redirect_uri: REDIRECT, code_verifier: verifier },
  });
  expect(tokenRes.status()).toBe(200);
  expect((await tokenRes.json()).access_token).toBeTruthy();
});

test("Deny sends the app access_denied", async ({ page }) => {
  await registerUser(page);
  const { url } = await authorizeUrl(page);
  await page.goto(url);
  await page.getByRole("button", { name: "Deny" }).click();
  await page.waitForURL(/^https:\/\/client\.example\/callback/);
  const back = new URL(page.url());
  expect(back.searchParams.get("error")).toBe("access_denied");
  expect(back.searchParams.get("state")).toBe("st4te");
});

test("an unregistered redirect address shows an error and never leaves Landed", async ({ page }) => {
  await registerUser(page);
  const { url } = await authorizeUrl(page);
  await page.goto(url.replace(encodeURIComponent(REDIRECT), encodeURIComponent("https://evil.example/cb")));
  await expect(page.getByText(/didn't register/)).toBeVisible();
  expect(new URL(page.url()).host).not.toContain("evil.example");
});
