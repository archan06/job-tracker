import bcrypt from "bcryptjs";
import { Prisma } from "@/generated/prisma/client";
import type { RegisterInput } from "@/lib/validation/auth";
import { db } from "@/server/db";
import { EmailTakenError } from "./errors";

const BCRYPT_COST = 12;
// Compared against when the email is unknown, so both paths take the same time.
// Precomputed (cost 12) so loading this module doesn't spend ~200ms hashing on every cold start.
const DUMMY_HASH = "$2b$12$ygAAA2ZW9lq..ShnOr/xPey1REHK1Gwd782KGqMu.0nbUKEg6uXPW";

export async function registerUser(input: RegisterInput): Promise<{ id: string; email: string }> {
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  try {
    return await db.user.create({
      data: { email: input.email.toLowerCase(), name: input.name, passwordHash },
      select: { id: true, email: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new EmailTakenError();
    }
    throw error;
  }
}

export async function verifyCredentials(
  email: string,
  password: string,
): Promise<{ id: string; email: string; name: string | null } | null> {
  const user = await db.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, email: true, name: true, passwordHash: true },
  });
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user?.passwordHash || !valid) return null;
  return { id: user.id, email: user.email, name: user.name };
}
