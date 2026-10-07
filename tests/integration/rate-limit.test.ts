import { beforeEach, expect, test } from "vitest";
import { db } from "@/server/db";
import { rateLimit } from "@/server/services/rate-limit";

beforeEach(async () => {
  await db.rateLimit.deleteMany();
});

const now = new Date("2026-10-07T12:00:00Z");
const later = (ms: number) => new Date(now.getTime() + ms);

test("allows up to the limit within a window, then blocks", async () => {
  for (let i = 0; i < 3; i++) expect((await rateLimit("t:a", 3, 60_000, now)).ok).toBe(true);
  const blocked = await rateLimit("t:a", 3, 60_000, later(1_000));
  expect(blocked.ok).toBe(false);
  expect(blocked.retryAfterMs).toBe(59_000);
});

test("a new window starts after the old one ends", async () => {
  for (let i = 0; i < 3; i++) await rateLimit("t:b", 3, 60_000, now);
  expect((await rateLimit("t:b", 3, 60_000, later(60_000))).ok).toBe(true);
});

test("keys are independent", async () => {
  await rateLimit("t:c", 1, 60_000, now);
  expect((await rateLimit("t:c", 1, 60_000, now)).ok).toBe(false);
  expect((await rateLimit("t:d", 1, 60_000, now)).ok).toBe(true);
});

test("concurrent hits are all counted", async () => {
  const results = await Promise.all(Array.from({ length: 10 }, () => rateLimit("t:e", 5, 60_000, now)));
  expect(results.filter((r) => r.ok)).toHaveLength(5);
});

import { RateLimitedError } from "@/server/services/errors";
import { WRITES_PER_MINUTE, enforceWriteLimit } from "@/server/services/rate-limit";

test("writes per account are capped per minute", async () => {
  for (let i = 0; i < WRITES_PER_MINUTE; i++) await enforceWriteLimit("user-1", now);
  await expect(enforceWriteLimit("user-1", later(30_000))).rejects.toBeInstanceOf(RateLimitedError);
  await expect(enforceWriteLimit("user-2", later(30_000))).resolves.toBeUndefined();
  await expect(enforceWriteLimit("user-1", later(60_000))).resolves.toBeUndefined();
});
