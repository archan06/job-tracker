import { execSync } from "node:child_process";
import { config } from "dotenv";

export default function setup() {
  config({ path: ".env.local", quiet: true });
  const testDb = process.env.TEST_DATABASE_URL;
  // These tests delete every row, so never let them touch the real database.
  if (!testDb) throw new Error("TEST_DATABASE_URL is not set");
  if (testDb === process.env.DATABASE_URL || testDb === process.env.DIRECT_URL) {
    throw new Error("TEST_DATABASE_URL must point to a different database than DATABASE_URL");
  }
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: testDb, DIRECT_URL: testDb },
    stdio: "ignore",
  });
}
