import { beforeEach, expect, test, vi } from "vitest";
import { db } from "@/server/db";
import { SUGGESTIONS_PER_MINUTE } from "@/server/services/rate-limit";
import { handleSuggest } from "@/server/suggest/handler";

beforeEach(async () => {
  await db.rateLimit.deleteMany();
});

const now = new Date("2026-10-07T12:00:00Z");
const request = (q?: string) => new Request(`http://localhost/api/suggest/company${q === undefined ? "" : `?q=${encodeURIComponent(q)}`}`);
const signedIn = (id: string) => async () => id;

test("signed-out requests get 401 and never reach the provider", async () => {
  const run = vi.fn(async () => ["x"]);
  const response = await handleSuggest(request("acme"), async () => null, run, now);
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: "unauthorized" });
  expect(run).not.toHaveBeenCalled();
});

test.each([[" a "], [undefined], ["a".repeat(101)]])("query %j is too short or long: empty list, no provider call", async (q) => {
  const run = vi.fn(async () => ["x"]);
  const response = await handleSuggest(request(q), signedIn("u1"), run, now);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ suggestions: [] });
  expect(run).not.toHaveBeenCalled();
});

test("a valid query is trimmed, passed on, and never cached", async () => {
  const run = vi.fn(async () => ["x"]);
  const response = await handleSuggest(request(" acme "), signedIn("u1"), run, now);
  expect(run).toHaveBeenCalledWith("u1", "acme");
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({ suggestions: ["x"] });
});

test("each user gets SUGGESTIONS_PER_MINUTE lookups a minute, then 429", async () => {
  expect(SUGGESTIONS_PER_MINUTE).toBe(120);
  const run = async () => [];
  for (let i = 0; i < SUGGESTIONS_PER_MINUTE; i++) {
    expect((await handleSuggest(request("acme"), signedIn("u1"), run, now)).status).toBe(200);
  }
  const blocked = await handleSuggest(request("acme"), signedIn("u1"), run, now);
  expect(blocked.status).toBe(429);
  expect(await blocked.json()).toEqual({ error: "rate_limited" });
  const retryAfter = Number(blocked.headers.get("retry-after"));
  expect(retryAfter).toBeGreaterThanOrEqual(1);
  expect(retryAfter).toBeLessThanOrEqual(60);
  expect((await handleSuggest(request("acme"), signedIn("u2"), run, now)).status).toBe(200);
});
