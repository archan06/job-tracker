import { expect, test } from "vitest";
import { formatDateOnly, parseDateOnly, toDateInputValue } from "@/lib/dates";

test("round trip keeps the calendar day", () => {
  expect(toDateInputValue(parseDateOnly("2026-01-31"))).toBe("2026-01-31");
  expect(formatDateOnly(parseDateOnly("2026-10-07"))).toBe("Oct 7, 2026");
});

test("invalid date throws", () => {
  expect(() => parseDateOnly("2026-02-30")).toThrow();
});

import { resolveToday } from "@/lib/dates";

test("resolveToday trusts the browser's local date within a day of the server's", () => {
  const now = new Date("2026-10-08T03:30:00Z"); // still Oct 7 in California
  expect(toDateInputValue(resolveToday("2026-10-07", now))).toBe("2026-10-07");
  expect(toDateInputValue(resolveToday("2026-10-09", now))).toBe("2026-10-09");
});

test("resolveToday falls back to the server's UTC date for missing, invalid or far-off values", () => {
  const now = new Date("2026-10-08T03:30:00Z");
  expect(toDateInputValue(resolveToday(undefined, now))).toBe("2026-10-08");
  expect(toDateInputValue(resolveToday("not-a-date", now))).toBe("2026-10-08");
  expect(toDateInputValue(resolveToday("2026-01-01", now))).toBe("2026-10-08");
});
