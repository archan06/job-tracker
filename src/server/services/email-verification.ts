import { newVerificationToken, hashVerificationToken, verificationEmail, verificationLink, VERIFY_TTL_MS } from "@/lib/email-verification";
import { db } from "@/server/db";
import type { EmailSender } from "@/server/mail/sender";
import { rateLimit } from "./rate-limit";

const HOUR = 60 * 60 * 1000;
export const SENDS_PER_ACCOUNT_PER_HOUR = 3;
export const SENDS_PER_NETWORK_PER_HOUR = 10;

export type SendResult = "sent" | "limited" | "unavailable" | "failed";

/**
 * Emails a fresh link. "limited" when the account or network has had too many this hour, "unavailable" with no
 * sender, "failed" when the email service refused it (never thrown, so a sending outage can't break sign-in).
 */
export async function sendVerification(userId: string, ip: string, sender: EmailSender | null, now = new Date()): Promise<SendResult> {
  if (!sender) return "unavailable";
  const [perAccount, perNetwork] = await Promise.all([
    rateLimit(`verify:user:${userId}`, SENDS_PER_ACCOUNT_PER_HOUR, HOUR, now),
    rateLimit(`verify:ip:${ip}`, SENDS_PER_NETWORK_PER_HOUR, HOUR, now),
  ]);
  if (!perAccount.ok || !perNetwork.ok) return "limited";

  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
  const { token, tokenHash } = newVerificationToken();
  await db.emailVerificationToken.create({ data: { userId, tokenHash, expiresAt: new Date(now.getTime() + VERIFY_TTL_MS) } });
  try {
    await sender.send({ to: user.email, ...verificationEmail(verificationLink(token)) });
  } catch (error) {
    console.warn("verification email failed", error);
    return "failed";
  }
  return "sent";
}

/**
 * True when the link is unexpired and was sent for `userId`; marks the account verified. Called only after that
 * account's password checked out, so verifying needs both the inbox and the password. The link keeps working until
 * it expires, because email scanners often open links before the person does.
 */
export async function verifyEmailToken(token: string, userId: string, now = new Date()): Promise<boolean> {
  const row = await db.emailVerificationToken.findUnique({ where: { tokenHash: hashVerificationToken(token) } });
  if (!row || row.userId !== userId || row.expiresAt <= now) return false;
  await db.user.updateMany({ where: { id: userId, emailVerified: null }, data: { emailVerified: now } });
  await db.user.update({ where: { id: userId }, data: { unverifiedExpiresAt: null } });
  return true;
}

/** The address a live link was sent to, for the "Verify and sign in" page. Changes nothing. */
export async function findVerificationEmail(token: string, now = new Date()): Promise<string | null> {
  const row = await db.emailVerificationToken.findUnique({
    where: { tokenHash: hashVerificationToken(token) },
    select: { expiresAt: true, user: { select: { email: true } } },
  });
  return row && row.expiresAt > now ? row.user.email : null;
}

/** Sends a new link if this address has an unverified password account. Says nothing either way. */
export async function requestNewLink(email: string, ip: string, sender: EmailSender | null, now = new Date()): Promise<void> {
  const user = await db.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, emailVerified: true, passwordHash: true },
  });
  if (!user || user.emailVerified || !user.passwordHash) return;
  await sendVerification(user.id, ip, sender, now);
}

/** Deletes sign-up accounts that never verified within 7 days, and links that expired over a day ago. */
export async function cleanupUnverified(now = new Date()): Promise<void> {
  await db.user.deleteMany({ where: { emailVerified: null, unverifiedExpiresAt: { lt: now } } });
  await db.emailVerificationToken.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - VERIFY_TTL_MS) } } });
}
