import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { consoleSender, emailSender, fakeSender } from "@/server/mail/sender";

test("the fake sender appends each email to its outbox as one JSON line", async () => {
  const outbox = join(mkdtempSync(join(tmpdir(), "outbox-")), "outbox.jsonl");
  const sender = fakeSender(outbox);
  await sender.send({ to: "a@example.com", subject: "One", text: "first" });
  await sender.send({ to: "b@example.com", subject: "Two", text: "second" });
  const lines = readFileSync(outbox, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  expect(lines).toEqual([
    { to: "a@example.com", subject: "One", text: "first" },
    { to: "b@example.com", subject: "Two", text: "second" },
  ]);
});

test("the sender is picked from the environment", () => {
  const fake = emailSender({ EMAIL_SENDER: "fake", FAKE_EMAIL_OUTBOX: "/tmp/x.jsonl", RESEND_API_KEY: "re_x" });
  const resend = emailSender({ RESEND_API_KEY: "re_x", NODE_ENV: "production" });
  expect(fake).not.toBeNull();
  expect(fake).not.toBe(consoleSender);
  expect(resend).not.toBeNull();
  expect(resend).not.toBe(consoleSender);
  expect(resend).not.toBe(fake);
  expect(emailSender({ NODE_ENV: "development" })).toBe(consoleSender);
  expect(emailSender({ NODE_ENV: "production" })).toBeNull();
});
