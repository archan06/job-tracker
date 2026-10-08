import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";
import { tmpdir } from "node:os";
import { join } from "node:path";

config({ path: ".env.local", quiet: true });

const testDb = process.env.TEST_DATABASE_URL;
if (!testDb || testDb === process.env.DATABASE_URL) {
  throw new Error("Set TEST_DATABASE_URL to a separate database before running end-to-end tests");
}

const PORT = 3200;

export const E2E_INBOUND_DOMAIN = "in.landed.test";
/** Where the app under test "sends" email (EMAIL_SENDER=fake); tests read verification links from it. */
export const E2E_OUTBOX = join(tmpdir(), "landed-e2e-outbox.jsonl");
export const E2E_WEBHOOK_SECRET = `whsec_${Buffer.from("landed-e2e-webhook-secret").toString("base64")}`;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    // A production build: it's what ships, and it can run while `npm run dev` is open.
    command: `npx next build && npx next start --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    // The app under test talks to the test database, never the real one.
    // AUTH_TRUST_HOST: Auth.js only trusts the request host automatically on Vercel.
    // SUGGEST_PROVIDER: fixed suggestion data instead of calling Logo.dev and Geoapify.
    // INBOUND_*/EMAIL_CLASSIFIER/RESEND_WEBHOOK_SECRET: forwarded-email tests sign fake webhooks; no Resend or Claude calls.
    // EMAIL_SENDER/FAKE_EMAIL_OUTBOX/APP_URL: verification emails go to a local file, with links to this server.
    env: {
      DATABASE_URL: testDb,
      DIRECT_URL: testDb,
      AUTH_TRUST_HOST: "true",
      SUGGEST_PROVIDER: "fake",
      INBOUND_PROVIDER: "fake",
      EMAIL_CLASSIFIER: "fake",
      INBOUND_EMAIL_DOMAIN: E2E_INBOUND_DOMAIN,
      RESEND_WEBHOOK_SECRET: E2E_WEBHOOK_SECRET,
      EMAIL_SENDER: "fake",
      FAKE_EMAIL_OUTBOX: E2E_OUTBOX,
      APP_URL: `http://localhost:${PORT}`,
    },
  },
});
