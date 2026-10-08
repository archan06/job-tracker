import { Webhook } from "standardwebhooks";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { POST } from "@/app/api/inbound/resend/route";
import { db } from "@/server/db";
import { getOrCreateInboundAddress, listInbox } from "@/server/inbound/service";
import { makeUser } from "./factories";

const SECRET = `whsec_${Buffer.from("route-test-secret-123456").toString("base64")}`;
const DOMAIN = "in.landed.test";

beforeEach(async () => {
  await db.rateLimit.deleteMany();
  vi.stubEnv("INBOUND_PROVIDER", "fake");
  vi.stubEnv("EMAIL_CLASSIFIER", "fake");
  vi.stubEnv("RESEND_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("INBOUND_EMAIL_DOMAIN", DOMAIN);
});
afterEach(() => vi.unstubAllEnvs());

let n = 0;
function signed(payload: unknown, { secret = SECRET, at = new Date() } = {}) {
  const body = JSON.stringify(payload);
  const id = `msg_${++n}`;
  const signature = new Webhook(secret).sign(id, at, body);
  return new Request("https://landed.test/api/inbound/resend", {
    method: "POST",
    headers: { "content-type": "application/json", "svix-id": id, "svix-timestamp": String(Math.floor(at.getTime() / 1000)), "svix-signature": signature },
    body,
  });
}

const received = (to: string, text: string, subject = "Thanks for applying") => ({
  type: "email.received",
  created_at: new Date().toISOString(),
  data: { email_id: `em_${++n}`, message_id: `<m${n}@x>`, from: "Stripe <jobs@stripe.com>", to: [to], received_for: [], subject, fake_text: text },
});

test("a signed email for a user is processed and lands on their board", async () => {
  const u = await makeUser();
  const to = await getOrCreateInboundAddress(u.id, DOMAIN);
  const res = await POST(signed(received(to, "Company: Stripe\nRole: Engineer\nThank you for applying")));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ status: "stored" });
  expect((await listInbox(u.id, "UPDATED"))[0]).toMatchObject({ company: "Stripe", createdApplication: true });
});

test("forged, unsigned, re-signed-with-another-secret or stale webhooks are rejected before any work", async () => {
  const u = await makeUser();
  const to = await getOrCreateInboundAddress(u.id, DOMAIN);
  const payload = received(to, "Company: Stripe\nRole: Engineer\nThank you for applying");
  const unsigned = new Request("https://landed.test/api/inbound/resend", { method: "POST", body: JSON.stringify(payload) });
  expect((await POST(unsigned)).status).toBe(401);
  expect((await POST(signed(payload, { secret: `whsec_${Buffer.from("someone-else-secret-xyz").toString("base64")}` }))).status).toBe(401);
  expect((await POST(signed(payload, { at: new Date(Date.now() - 60 * 60_000) }))).status).toBe(401);
  const tampered = signed(payload);
  const body = (await tampered.clone().text()).replace("Stripe", "Google");
  expect((await POST(new Request(tampered.url, { method: "POST", headers: tampered.headers, body }))).status).toBe(401);
  expect(await db.inboundEmail.count({ where: { userId: u.id } })).toBe(0);
});

test("other event types and unknown recipients are acknowledged and ignored", async () => {
  expect(await (await POST(signed({ type: "email.delivered", created_at: new Date().toISOString(), data: {} }))).json()).toEqual({ status: "ignored" });
  expect(await (await POST(signed(received(`u-zzzzzzzzzz@${DOMAIN}`, "hi")))).json()).toEqual({ status: "ignored" });
});

test("without a webhook secret configured the endpoint is unavailable", async () => {
  vi.stubEnv("RESEND_WEBHOOK_SECRET", "");
  expect((await POST(signed(received(`u-zzzzzzzzzz@${DOMAIN}`, "hi")))).status).toBe(503);
});
