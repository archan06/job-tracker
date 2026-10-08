import { afterAll, beforeEach } from "vitest";
import { db } from "@/server/db";

beforeEach(async () => {
  // Deleting users cascades to every other app table.
  await db.user.deleteMany();
  // OAuth clients aren't owned by a user, so they're cleared separately.
  await db.oAuthClient.deleteMany();
});

afterAll(async () => {
  await db.$disconnect();
});
