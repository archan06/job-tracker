import { Webhook } from "standardwebhooks";
import { expect, test, type Page } from "@playwright/test";
import { E2E_WEBHOOK_SECRET } from "../../playwright.config";
import { signUpAndVerify, useFreshNetwork } from "./helpers";

test.beforeEach(async ({ page }) => {
  await useFreshNetwork(page);
  const email = `e2e-mail-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${test.info().project.name}@example.com`;
  await signUpAndVerify(page, { name: "E2E", email, password: "e2e-password-123" });
});

let n = 0;
async function forward(page: Page, to: string, subject: string, text: string) {
  const body = JSON.stringify({
    type: "email.received",
    created_at: new Date().toISOString(),
    data: { email_id: `em_${Date.now()}_${++n}`, message_id: `<${Date.now()}.${n}.${Math.random()}@mail>`, from: "Recruiting <jobs@company.example>", to: [to], received_for: [], subject, fake_text: text },
  });
  const id = `msg_${Date.now()}_${n}`;
  const now = new Date();
  const res = await page.request.post("/api/inbound/resend", {
    headers: {
      "content-type": "application/json",
      "svix-id": id,
      "svix-timestamp": String(Math.floor(now.getTime() / 1000)),
      "svix-signature": new Webhook(E2E_WEBHOOK_SECRET).sign(id, now, body),
    },
    data: body,
  });
  expect(res.status()).toBe(200);
}

async function myAddress(page: Page) {
  await page.goto("/email");
  return (await page.getByTestId("inbound-address").textContent())!.trim();
}

test("a forwarded confirmation creates an application; Undo removes it", async ({ page }) => {
  const to = await myAddress(page);
  expect(to).toMatch(/^u-[a-z0-9]{10}@in\.landed\.test$/);
  await forward(page, to, "Thank you for applying", "Company: Northwind\nRole: Data Engineer\nThank you for applying!");
  await page.goto("/board");
  await expect(page.getByTestId("column-APPLIED").getByText("Northwind")).toBeVisible();
  await page.goto("/email");
  await page.getByRole("tab", { name: /Updated/ }).click();
  await expect(page.getByText("Thank you for applying").first()).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("button", { name: "Undo" })).toBeHidden();
  await page.goto("/board");
  await expect(page.getByText("Northwind")).toBeHidden();
});

test("an unmatched offer waits for review, shows a badge, and can be applied to an application", async ({ page }) => {
  await page.goto("/applications/new");
  await page.getByRole("combobox", { name: "Company", exact: true }).fill("Contoso");
  await page.getByLabel("Job title").fill("Engineer");
  await page.getByRole("button", { name: "Save application" }).click();
  await expect(page).toHaveURL(/\/applications\/(?!new)[^/]+$/);

  const to = await myAddress(page);
  await forward(page, to, "Your offer", "Company: Contoso Holdings\nRole: Engineer\nWe are happy to extend an offer");
  await page.goto("/email");
  await expect(page.getByTestId("inbox-badge").first()).toHaveText("1");
  await page.getByRole("tab", { name: /Needs review/ }).click();
  await expect(page.getByText("No matching application")).toBeVisible();
  await page.getByLabel("Apply to").selectOption({ label: "Contoso · Engineer" });
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("No matching application")).toBeHidden();
  await page.goto("/board");
  await expect(page.getByTestId("column-OFFER").getByText("Contoso")).toBeVisible();
});

test("Gmail's forwarding code shows up during setup", async ({ page }) => {
  const to = await myAddress(page);
  const body = JSON.stringify({
    type: "email.received",
    created_at: new Date().toISOString(),
    data: {
      email_id: `em_fwd_${Date.now()}`, message_id: `<fwd.${Date.now()}@google>`, from: "Gmail Team <forwarding-noreply@google.com>", to: [to], received_for: [],
      subject: "(#987654321) Gmail Forwarding Confirmation - Receive Mail from e2e@gmail.com", fake_text: "Confirmation code: 987654321",
    },
  });
  const id = `msg_fwd_${Date.now()}`;
  const now = new Date();
  await page.request.post("/api/inbound/resend", {
    headers: { "content-type": "application/json", "svix-id": id, "svix-timestamp": String(Math.floor(now.getTime() / 1000)), "svix-signature": new Webhook(E2E_WEBHOOK_SECRET).sign(id, now, body) },
    data: body,
  });
  await page.goto("/email");
  await expect(page.getByText("987654321")).toBeVisible();
});

test("Gmail's newer confirmation link shows up as a button during setup", async ({ page }) => {
  const to = await myAddress(page);
  const link = "https://mail-settings.google.com/mail/vf-%5BE2E%5D-LINK";
  const body = JSON.stringify({
    type: "email.received",
    created_at: new Date().toISOString(),
    data: {
      email_id: `em_fwdl_${Date.now()}`, message_id: `<fwdl.${Date.now()}@google>`, from: "forwarding-noreply@google.com", to: [to], received_for: [],
      subject: "(Gmail Forwarding Confirmation - Receive Mail from e2e@gmail.com",
      fake_text: `please click the link below to confirm the request:\n\n${link}\n\nIf you click the link and it appears to be broken`,
    },
  });
  const id = `msg_fwdl_${Date.now()}`;
  const now = new Date();
  await page.request.post("/api/inbound/resend", {
    headers: { "content-type": "application/json", "svix-id": id, "svix-timestamp": String(Math.floor(now.getTime() / 1000)), "svix-signature": new Webhook(E2E_WEBHOOK_SECRET).sign(id, now, body) },
    data: body,
  });
  await page.goto("/email");
  await expect(page.getByRole("link", { name: "Confirm forwarding in Gmail" })).toHaveAttribute("href", link);
});
