import { expect, test } from "vitest";
import { runAction } from "@/lib/run-action";

test("passes results through", async () => {
  expect(await runAction(async () => ({ ok: true }))).toEqual({ ok: true });
  expect(await runAction(async () => ({ ok: false, error: "Nope" }))).toEqual({ ok: false, error: "Nope" });
});

test("turns a thrown error (network, database) into a failed result", async () => {
  const result = await runAction(async () => {
    throw new Error("Connection terminated unexpectedly");
  });
  expect(result).toEqual({ ok: false, error: "Couldn't save. Check your connection and try again." });
});
