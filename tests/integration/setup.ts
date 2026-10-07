import { afterAll, beforeEach } from "vitest";
import { db } from "@/server/db";

beforeEach(async () => {
  // Deleting users cascades to every other app table.
  await db.user.deleteMany();
});

afterAll(async () => {
  await db.$disconnect();
});
