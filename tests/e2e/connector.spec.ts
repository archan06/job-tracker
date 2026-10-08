import { createHash, randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { signUpAndVerify, useFreshNetwork } from "./helpers";

const REDIRECT = "https://client.example/callback";

async function registerUser(page: Page) {
  const email = `e2e-mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${test.info().project.name}@example.com`;
  await signUpAndVerify(page, { name: "E2E", email, password: "e2e-password-123" });
  return email;
}

async function authorizeUrl(page: Page, clientName = "Test Assistant") {
  // API calls don't carry the page's fake network header, so give registration its own (it's limited per network).
  const ip = `198.51.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`;
  const reg = await page.request.post("/oauth/register", {
    headers: { "x-forwarded-for": ip },
    data: { client_name: clientName, redirect_uris: [REDIRECT] },
  });
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

test("signed out: sign in, see consent, Allow, and land back on the app with a code", async ({ page: setupPage, browser }) => {
  const email = await registerUser(setupPage);
  // A fresh context is truly signed out; clearing cookies can race a response that sets them again.
  const page = await (await browser.newContext()).newPage();
  await useFreshNetwork(page);
  await page.route("https://client.example/**", (route) => route.fulfill({ status: 200, body: "client callback" }));
  const { url, client_id, verifier } = await authorizeUrl(page);
  await page.goto(url);
  await expect(page).toHaveURL(/\/login\?callbackUrl=/);
  // Typing before the login form hydrates can be lost (a known issue on main), so let it load first.
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("e2e-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: /Test Assistant/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /client\.example/ })).toBeVisible();
  await expect(page.getByText("View your applications")).toBeVisible();
  await expect(page.getByText("Add and update applications")).toBeVisible();
  await expect(page.getByText(/Unverified app/)).toBeVisible();
  await expect(page.getByText("client.example", { exact: true })).toBeVisible();
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

test("Connected apps lists the app; Disconnect removes it and its token stops working", async ({ page }) => {
  await registerUser(page);
  const { url, client_id, verifier } = await authorizeUrl(page);
  await page.goto(url);
  await page.getByRole("button", { name: "Allow" }).click();
  await page.waitForURL(/^https:\/\/client\.example\/callback/);
  const code = new URL(page.url()).searchParams.get("code")!;
  const { access_token } = await (await page.request.post("/oauth/token", {
    form: { grant_type: "authorization_code", code, client_id, redirect_uri: REDIRECT, code_verifier: verifier },
  })).json();
  const mcp = () => page.request.post("/api/mcp", {
    headers: { authorization: `Bearer ${access_token}`, accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" },
    data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
  });
  expect((await mcp()).status()).toBe(200);

  await page.goto("/board");
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("menuitem", { name: "Connected apps" }).click();
  await expect(page).toHaveURL(/\/settings\/connections$/);
  await expect(page.getByText("Test Assistant")).toBeVisible();
  await expect(page.getByText(/\/api\/mcp/)).toBeVisible();
  await page.getByRole("button", { name: "Disconnect Test Assistant" }).click();
  await expect(page.getByText("Test Assistant")).toBeHidden();
  await expect(page.getByText(/No apps connected/)).toBeVisible();
  expect((await mcp()).status()).toBe(401);
});

test("signed-out visitors go to sign-in before Landed does anything for the app, even for a bad request", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await useFreshNetwork(page);
  await page.goto(`/oauth/authorize?${new URLSearchParams({ client_id: "https://attacker.example/c.json", response_type: "nope" })}`);
  await expect(page).toHaveURL(/\/login\?callbackUrl=/);
});

test("an app calling itself Claude from another site gets a clear warning", async ({ page }) => {
  await registerUser(page);
  const { url } = await authorizeUrl(page, "Claude");
  await page.goto(url);
  await expect(page.getByText(/This isn't the official Claude/)).toBeVisible();
});
