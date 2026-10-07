import bcrypt from "bcryptjs";
import { expect, test, vi } from "vitest";

test("loading the users service doesn't hash anything (it's on every cold start)", async () => {
  const hashSync = vi.spyOn(bcrypt, "hashSync");
  await import("@/server/services/users");
  expect(hashSync).not.toHaveBeenCalled();
});
