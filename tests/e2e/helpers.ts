import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { E2E_OUTBOX } from "../../playwright.config";

/** Each test pretends to come from its own network, so sign-up limits don't carry over between runs. */
export async function useFreshNetwork(page: Page) {
  const octet = () => Math.floor(Math.random() * 250) + 1;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `203.0.${octet()}.${octet()}` });
}

/** The newest verification link emailed to `email` (via the fake outbox), waiting up to 10 seconds for it. */
export async function latestLinkFor(email: string): Promise<string> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    let lines: { to: string; text: string }[] = [];
    try {
      lines = readFileSync(E2E_OUTBOX, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
    } catch {}
    const mail = lines.filter((m) => m.to === email.toLowerCase()).at(-1);
    const link = mail?.text.match(/https?:\/\/\S+\/verify-email\?token=\S+/)?.[0];
    if (link) return link;
    if (Date.now() > deadline) throw new Error(`No verification email for ${email}`);
    await new Promise((r) => setTimeout(r, 200));
  }
}

/** How many verification emails `email` has been sent. */
export function emailsTo(email: string): number {
  try {
    return readFileSync(E2E_OUTBOX, "utf8").trim().split("\n").filter(Boolean).filter((l) => JSON.parse(l).to === email.toLowerCase()).length;
  } catch {
    return 0;
  }
}

/** Signs up, opens the emailed link, confirms with the password, and lands on the board. */
export async function signUpAndVerify(page: Page, { name, email, password }: { name: string; email: string; password: string }) {
  await page.goto("/register");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/check-email/);
  await page.goto(await latestLinkFor(email));
  await expect(page.getByRole("heading", { name: "Verify and sign in" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Verify and sign in" }).click();
  await expect(page).toHaveURL(/\/board/);
}
