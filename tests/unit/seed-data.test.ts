import { expect, test } from "vitest";
import { mulberry32, statusPath } from "@/lib/seed-data";
import { STATUSES } from "@/lib/status";

test("paths start at SAVED and end at the final status", () => {
  const rng = mulberry32(1);
  for (const s of STATUSES) {
    const p = statusPath(s, rng);
    expect(p[0]).toBe("SAVED");
    expect(p.at(-1)).toBe(s);
  }
});

test("OFFER path passes through every funnel stage in order", () => {
  expect(statusPath("OFFER", mulberry32(1))).toEqual(["SAVED", "APPLIED", "INTERVIEW", "OFFER"]);
});

test("REJECTED happens after APPLIED", () => {
  for (let seed = 1; seed < 20; seed++) {
    const p = statusPath("REJECTED", mulberry32(seed));
    expect(p.indexOf("APPLIED")).toBeGreaterThan(-1);
    expect(p.indexOf("APPLIED")).toBeLessThan(p.length - 1);
  }
});

test("mulberry32 is deterministic", () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  expect([a(), a(), a()]).toEqual([b(), b(), b()]);
});
