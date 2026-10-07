import { expect, test } from "vitest";
import { describeEvent } from "@/lib/timeline";

test("describes events", () => {
  expect(describeEvent({ type: "STATUS_CHANGE", fromStatus: null, toStatus: "SAVED" })).toBe("Added as Saved");
  expect(describeEvent({ type: "STATUS_CHANGE", fromStatus: "APPLIED", toStatus: "INTERVIEW" })).toBe(
    "Applied → Interview",
  );
  expect(describeEvent({ type: "INTERVIEW", fromStatus: null, toStatus: null })).toBe("Interview");
  expect(describeEvent({ type: "FOLLOW_UP", fromStatus: null, toStatus: null })).toBe("Follow-up");
  expect(describeEvent({ type: "EMAIL", fromStatus: null, toStatus: null })).toBe("Email");
  expect(describeEvent({ type: "NOTE", fromStatus: null, toStatus: null })).toBe("Note");
});
