import { expect, test } from "vitest";
import { db } from "@/server/db";
import { EmailTakenError } from "@/server/services/errors";
import { registerUser, verifyCredentials } from "@/server/services/users";

test("registers with lowercase email and hashed password", async () => {
  const u = await registerUser({ email: "foo@example.com", name: "Foo", password: "correct-horse" });
  const row = await db.user.findUniqueOrThrow({ where: { id: u.id } });
  expect(row.email).toBe("foo@example.com");
  expect(row.passwordHash).toBeTruthy();
  expect(row.passwordHash).not.toBe("correct-horse");
});

test("duplicate email of a verified account throws EmailTakenError", async () => {
  const u = await registerUser({ email: "foo@example.com", name: "Foo", password: "correct-horse" });
  await db.user.update({ where: { id: u.id }, data: { emailVerified: new Date(), unverifiedExpiresAt: null } });
  await expect(
    registerUser({ email: "foo@example.com", name: "X", password: "another-pass" }),
  ).rejects.toBeInstanceOf(EmailTakenError);
});

test("verifyCredentials accepts the right password in any email case", async () => {
  await registerUser({ email: "foo@example.com", name: "Foo", password: "correct-horse" });
  expect(await verifyCredentials("FOO@example.com", "correct-horse")).toMatchObject({ email: "foo@example.com" });
  expect(await verifyCredentials("foo@example.com", "wrong")).toBeNull();
  expect(await verifyCredentials("nobody@example.com", "correct-horse")).toBeNull();
});

test("Google-only user (no passwordHash) cannot log in with a password", async () => {
  await db.user.create({ data: { email: "g@example.com" } });
  expect(await verifyCredentials("g@example.com", "anything-at-all")).toBeNull();
});
