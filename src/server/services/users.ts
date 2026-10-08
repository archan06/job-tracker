import bcrypt from "bcryptjs";
import { Prisma } from "@/generated/prisma/client";
import type { RegisterInput } from "@/lib/validation/auth";
import { UNVERIFIED_TTL_MS } from "@/lib/email-verification";
import { db } from "@/server/db";
import { cleanupUnverified } from "./email-verification";
import { EmailTakenError } from "./errors";

const BCRYPT_COST = 12;
// Compared against when the email is unknown, so both paths take the same time.
// Precomputed (cost 12) so loading this module doesn't spend ~200ms hashing on every cold start.
const DUMMY_HASH = "$2b$12$ygAAA2ZW9lq..ShnOr/xPey1REHK1Gwd782KGqMu.0nbUKEg6uXPW";

/**
 * Creates an unverified account. An address whose account came from sign-up and was never verified is
 * taken over (new name and password), so someone who signs up with your address can't keep it from you.
 * Verified accounts, and accounts from before email verification, count as taken.
 */
export async function registerUser(input: RegisterInput, now = new Date()): Promise<{ id: string; email: string }> {
  await cleanupUnverified(now);
  const email = input.email.toLowerCase();
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  const unverifiedExpiresAt = new Date(now.getTime() + UNVERIFIED_TTL_MS);
  try {
    return await db.user.create({
      data: { email, name: input.name, passwordHash, unverifiedExpiresAt },
      select: { id: true, email: true },
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
  }
  const { count } = await db.user.updateMany({
    where: { email, emailVerified: null, unverifiedExpiresAt: { not: null } },
    data: { name: input.name, passwordHash, unverifiedExpiresAt },
  });
  if (count === 0) throw new EmailTakenError();
  const user = await db.user.findUniqueOrThrow({ where: { email }, select: { id: true, email: true } });
  await db.emailVerificationToken.deleteMany({ where: { userId: user.id } });
  return user;
}

export async function verifyCredentials(
  email: string,
  password: string,
): Promise<{ id: string; email: string; name: string | null; emailVerified: Date | null } | null> {
  const user = await db.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, email: true, name: true, emailVerified: true, passwordHash: true },
  });
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user?.passwordHash || !valid) return null;
  return { id: user.id, email: user.email, name: user.name, emailVerified: user.emailVerified };
}
