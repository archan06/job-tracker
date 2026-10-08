import { Webhook } from "standardwebhooks";
import { expect, test, vi } from "vitest";
import { CLASSIFIER_MODEL, fakeClassifier, haikuClassifier } from "@/server/inbound/classifier";
import { fakeProvider } from "@/server/inbound/provider";

const email = { from: "Stripe <jobs@stripe.com>", subject: "Thanks for applying", date: new Date("2026-10-08T10:00:00Z"), text: "x".repeat(20_000) };

test("Haiku classifier sends a fixed-schema request with the email marked untrusted, truncated", async () => {
  const parse = vi.fn(async (request: unknown) => ({
    request,
    stop_reason: "end_turn",
    parsed_output: { kind: "APPLICATION_CONFIRMATION", confidence: 1.3, company: "Stripe", jobTitle: "Engineer", companyDomain: null, interviewAt: null, summary: "Applied" },
  }));
  const result = await haikuClassifier({ messages: { parse } } as never).classify(email);
  const request = parse.mock.calls[0][0] as unknown as { model: string; max_tokens: number; system: string; output_config: { format: unknown }; messages: { content: string }[] };
  expect(CLASSIFIER_MODEL).toBe("claude-haiku-4-5");
  expect(request.model).toBe("claude-haiku-4-5");
  expect(request.max_tokens).toBe(1024);
  expect(request.system).toMatch(/untrusted/i);
  const schema = (request.output_config.format as { schema: { properties: Record<string, { enum?: string[] }>; additionalProperties: boolean } }).schema;
  expect(schema.properties.kind.enum).toEqual(["APPLICATION_CONFIRMATION", "INTERVIEW", "REJECTION", "OFFER", "NOT_JOB_RELATED"]);
  expect(schema.additionalProperties).toBe(false);
  expect(request.messages[0].content).toContain("Thanks for applying");
  expect(request.messages[0].content.length).toBeLessThan(13_000);
  expect(result).toMatchObject({ kind: "APPLICATION_CONFIRMATION", confidence: 1, company: "Stripe" });
});

test("Haiku classifier rejects output outside the schema (e.g. an invented kind)", async () => {
  const invented = { messages: { parse: async () => ({ stop_reason: "end_turn", parsed_output: { kind: "ASSESSMENT", confidence: 0.9, company: null, jobTitle: null, companyDomain: null, interviewAt: null, summary: "x" } }) } } as never;
  await expect(haikuClassifier(invented).classify(email)).rejects.toThrow();
});

test("Haiku classifier throws on refusal or unparseable output", async () => {
  const refused = { messages: { parse: async () => ({ stop_reason: "refusal", parsed_output: null }) } } as never;
  await expect(haikuClassifier(refused).classify(email)).rejects.toThrow();
  const garbled = { messages: { parse: async () => ({ stop_reason: "end_turn", parsed_output: null }) } } as never;
  await expect(haikuClassifier(garbled).classify(email)).rejects.toThrow();
});

test("fake classifier reads keywords and Company:/Role: lines", async () => {
  const c = await fakeClassifier.classify({ ...email, subject: "Interview invitation", text: "Company: Stripe\nRole: Engineer\nLet's talk" });
  expect(c).toMatchObject({ kind: "INTERVIEW", company: "Stripe", jobTitle: "Engineer", confidence: 0.95 });
  expect((await fakeClassifier.classify({ ...email, subject: "Weekly newsletter", text: "hi" })).kind).toBe("NOT_JOB_RELATED");
  expect((await fakeClassifier.classify({ ...email, subject: "Update", text: "Unfortunately we will not move forward" })).kind).toBe("REJECTION");
});

test("fake provider accepts only correctly signed received events and returns their content", async () => {
  const secret = `whsec_${Buffer.from("test-secret-0123456789").toString("base64")}`;
  const provider = fakeProvider(secret);
  const body = JSON.stringify({
    type: "email.received",
    created_at: "2026-10-08T10:00:00Z",
    data: { email_id: "em_1", message_id: "<m1@x>", from: "a@b.com", to: ["u-abcdefghij@in.test"], received_for: [], subject: "Hi", fake_text: "Body" },
  });
  const wh = new Webhook(secret);
  const id = "msg_1";
  const ts = new Date();
  const signature = wh.sign(id, ts, body);
  const headers = new Headers({ "svix-id": id, "svix-timestamp": String(Math.floor(ts.getTime() / 1000)), "svix-signature": signature });
  const event = provider.verify(body, headers);
  expect(event).toMatchObject({ type: "email.received", emailId: "em_1", recipients: ["u-abcdefghij@in.test"] });
  expect(await provider.fetch("em_1")).toMatchObject({ text: "Body", subject: "Hi", messageId: "<m1@x>" });
  expect(provider.verify(body.replace("Hi", "Ho"), headers)).toBeNull();
  expect(provider.verify(body, new Headers())).toBeNull();
});

test("an event without a Message-ID falls back to Resend's email id, so it isn't mistaken for a duplicate", async () => {
  const secret = `whsec_${Buffer.from("test-secret-0123456789").toString("base64")}`;
  const body = JSON.stringify({ type: "email.received", created_at: "2026-10-08T10:00:00Z", data: { email_id: "em_9", message_id: "", from: "a@b.com", to: ["x@y.z"], subject: "Hi" } });
  const ts = new Date();
  const headers = new Headers({ "svix-id": "m9", "svix-timestamp": String(Math.floor(ts.getTime() / 1000)), "svix-signature": new Webhook(secret).sign("m9", ts, body) });
  expect(fakeProvider(secret).verify(body, headers)).toMatchObject({ messageId: "em_9" });
});
