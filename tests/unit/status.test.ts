import { expect, test } from "vitest";
import { STATUSES, STATUS_LABELS } from "@/lib/status";

test("board columns, in order", () => {
  expect(STATUSES).toEqual(["SAVED", "APPLIED", "INTERVIEW", "OFFER", "REJECTED", "WITHDRAWN"]);
  expect(Object.keys(STATUS_LABELS)).toEqual([...STATUSES]);
});
