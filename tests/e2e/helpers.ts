import type { Page } from "@playwright/test";

/** Each test pretends to come from its own network, so sign-up limits don't carry over between runs. */
export async function useFreshNetwork(page: Page) {
  const octet = () => Math.floor(Math.random() * 250) + 1;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `203.0.${octet()}.${octet()}` });
}
