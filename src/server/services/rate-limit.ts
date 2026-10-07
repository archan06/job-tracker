import { db } from "@/server/db";
import { RateLimitedError } from "./errors";

export type RateLimitResult = { ok: boolean; retryAfterMs: number };

/**
 * Counts one hit for `key` in a fixed window and says whether it's allowed.
 * One atomic upsert, so concurrent requests on different servers can't both slip through.
 */
export async function rateLimit(key: string, limit: number, windowMs: number, now = new Date()): Promise<RateLimitResult> {
  const resetAt = new Date(now.getTime() + windowMs);
  const [row] = await db.$queryRaw<{ count: number; resetAt: Date }[]>`
    INSERT INTO "RateLimit" ("key", "count", "resetAt")
    VALUES (${key}, 1, ${resetAt})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."resetAt" <= ${now} THEN 1 ELSE "RateLimit"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimit"."resetAt" <= ${now} THEN ${resetAt} ELSE "RateLimit"."resetAt" END
    RETURNING "count", "resetAt"`;
  const ok = row.count <= limit;
  return { ok, retryAfterMs: ok ? 0 : row.resetAt.getTime() - now.getTime() };
}

/** Creates, edits, moves, deletes and timeline entries per account per minute. */
export const WRITES_PER_MINUTE = 60;

export async function enforceWriteLimit(userId: string, now = new Date()): Promise<void> {
  const { ok } = await rateLimit(`write:${userId}`, WRITES_PER_MINUTE, 60_000, now);
  if (!ok) throw new RateLimitedError();
}

/** Autocomplete lookups per account per minute. Plenty for typing, too few to drain the providers' free quotas. */
export const SUGGESTIONS_PER_MINUTE = 120;
