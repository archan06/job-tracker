import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import bcrypt from "bcryptjs";
import { beforeEach, expect, test } from "vitest";
import { db } from "@/server/db";
import { fakeSender, type EmailSender } from "@/server/mail/sender";
import { cleanupUnverified, requestNewLink, sendVerification, verifyEmailToken } from "@/server/services/email-verification";
import { EmailTakenError } from "@/server/services/errors";
import { registerUser, verifyCredentials } from "@/server/services/users";

const DAY = 24 * 60 * 60 * 1000;
const t0 = new Date("2026-10-08T12:00:00Z");
const at = (ms: number) => new Date(t0.getTime() + ms);

let outbox: string;
let sender: EmailSender;
let n = 0;
const ip = () => `198.51.${Math.floor(Math.random() * 250)}.${++n % 250}`;
const email = () => `verify-${Date.now()}-${++n}@example.com`;

beforeEach(() => {
  outbox = join(mkdtempSync(join(tmpdir(), "verify-")), "outbox.jsonl");
  sender = fakeSender(outbox);
});

function sent(): { to: string; subject: string; text: string }[] {
  try {
    return readFileSync(outbox, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}
const tokenIn = (text: string) => text.match(/verify-email\?token=([A-Za-z0-9_-]+)/)![1];

async function signUp(address = email(), password = "password-123", now = t0) {
  return registerUser({ name: "Tester", email: address, password }, now);
}

/** An account from before email verification: a password, never verified, no expiry. */
async function legacyUser(address = email()) {
  return db.user.create({ data: { email: address, name: "Old", passwordHash: await bcrypt.hash("old-password-1", 4) } });
}

test("sign-up creates an unverified user that expires in 7 days", async () => {
  const user = await signUp();
  const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  expect(row.emailVerified).toBeNull();
  expect(row.unverifiedExpiresAt).toEqual(at(7 * DAY));
});

test("sendVerification stores only a hash and emails a link to /verify-email", async () => {
  const user = await signUp();
  expect(await sendVerification(user.id, ip(), sender, t0)).toBe("sent");
  const [mail] = sent();
  expect(mail.to).toBe(user.email);
  const token = tokenIn(mail.text);
  const rows = await db.emailVerificationToken.findMany({ where: { userId: user.id } });
  expect(rows).toHaveLength(1);
  expect(rows[0].expiresAt).toEqual(at(DAY));
  expect(JSON.stringify(rows)).not.toContain(token);
});

test("the same link verifies, and verifies again", async () => {
  const user = await signUp();
  await sendVerification(user.id, ip(), sender, t0);
  const token = tokenIn(sent()[0].text);
  expect(await verifyEmailToken(token, at(60_000))).toBe(true);
  expect(await verifyEmailToken(token, at(120_000))).toBe(true);
  const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  expect(row.emailVerified).toEqual(at(60_000));
  expect(row.unverifiedExpiresAt).toBeNull();
});

test("an expired link is refused", async () => {
  const user = await signUp();
  await sendVerification(user.id, ip(), sender, t0);
  expect(await verifyEmailToken(tokenIn(sent()[0].text), at(DAY + 1))).toBe(false);
  expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerified).toBeNull();
});

test("an unknown token is refused", async () => {
  expect(await verifyEmailToken("not-a-real-token", t0)).toBe(false);
});

test("a 4th send in an hour for one account is limited", async () => {
  const user = await signUp();
  for (let i = 0; i < 3; i++) expect(await sendVerification(user.id, ip(), sender, t0)).toBe("sent");
  expect(await sendVerification(user.id, ip(), sender, t0)).toBe("limited");
  expect(sent()).toHaveLength(3);
});

test("an 11th send from one network is limited", async () => {
  const network = ip();
  for (let i = 0; i < 10; i++) {
    const user = await signUp();
    expect(await sendVerification(user.id, network, sender, t0)).toBe("sent");
  }
  const last = await signUp();
  expect(await sendVerification(last.id, network, sender, t0)).toBe("limited");
});

test("without a sender, nothing is stored and the answer is unavailable", async () => {
  const user = await signUp();
  expect(await sendVerification(user.id, ip(), null, t0)).toBe("unavailable");
  expect(await db.emailVerificationToken.count({ where: { userId: user.id } })).toBe(0);
});

test("sign-up replaces an unverified account created by sign-up", async () => {
  const address = email();
  const first = await signUp(address, "first-password-1");
  await sendVerification(first.id, ip(), sender, t0);
  const second = await signUp(address, "second-password-2", at(DAY));
  expect(second.id).toBe(first.id);
  expect(await verifyCredentials(address, "second-password-2")).not.toBeNull();
  expect(await verifyCredentials(address, "first-password-1")).toBeNull();
  expect(await db.emailVerificationToken.count({ where: { userId: first.id } })).toBe(0);
  expect((await db.user.findUniqueOrThrow({ where: { id: first.id } })).unverifiedExpiresAt).toEqual(at(8 * DAY));
});

test("sign-up never replaces a verified account", async () => {
  const address = email();
  const user = await signUp(address, "first-password-1");
  await sendVerification(user.id, ip(), sender, t0);
  await verifyEmailToken(tokenIn(sent()[0].text), t0);
  await expect(signUp(address, "second-password-2")).rejects.toBeInstanceOf(EmailTakenError);
  expect(await verifyCredentials(address, "first-password-1")).not.toBeNull();
});

test("sign-up never replaces an account from before this change", async () => {
  const old = await legacyUser();
  await expect(signUp(old.email, "stranger-password-1")).rejects.toBeInstanceOf(EmailTakenError);
  expect(await verifyCredentials(old.email, "old-password-1")).not.toBeNull();
});

test("cleanup deletes only sign-up accounts past 7 days", async () => {
  const fresh = await signUp(email(), "password-123", at(DAY));
  const stale = await signUp();
  const old = await legacyUser();
  await cleanupUnverified(at(7 * DAY + 1));
  expect(await db.user.findUnique({ where: { id: stale.id } })).toBeNull();
  expect(await db.user.findUnique({ where: { id: fresh.id } })).not.toBeNull();
  expect(await db.user.findUnique({ where: { id: old.id } })).not.toBeNull();
});

test("sign-up runs the cleanup", async () => {
  const stale = await signUp();
  await signUp(email(), "password-123", at(8 * DAY));
  expect(await db.user.findUnique({ where: { id: stale.id } })).toBeNull();
});

test("requestNewLink sends nothing for unknown, verified or Google-only users", async () => {
  const verified = await db.user.create({ data: { email: email(), passwordHash: "x", emailVerified: t0 } });
  const google = await db.user.create({ data: { email: email() } });
  for (const address of [email(), verified.email, google.email]) await requestNewLink(address, ip(), sender, t0);
  expect(sent()).toHaveLength(0);
  const legacy = await legacyUser();
  await requestNewLink(legacy.email.toUpperCase(), ip(), sender, t0);
  expect(sent().map((m) => m.to)).toEqual([legacy.email]);
});
