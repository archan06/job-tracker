import { SUGGESTIONS_PER_MINUTE, rateLimit } from "@/server/services/rate-limit";

const MIN_QUERY = 2;
const MAX_QUERY = 100;
// Suggestions include the user's own companies, so no shared cache may keep them.
const NO_STORE = { "Cache-Control": "private, no-store" };

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { ...NO_STORE, ...headers } });

/**
 * The shared shape of every /api/suggest route: signed in, a 2-100 character query,
 * under the per-user rate limit, then `run`. Both routes answer { suggestions: [...] }.
 */
export async function handleSuggest<T>(
  request: Request,
  getUserId: () => Promise<string | null>,
  run: (userId: string, query: string) => Promise<T[]>,
  now = new Date(),
): Promise<Response> {
  const userId = await getUserId();
  if (!userId) return json({ error: "unauthorized" }, 401);

  const query = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (query.length < MIN_QUERY || query.length > MAX_QUERY) return json({ suggestions: [] });

  const limit = await rateLimit(`suggest:${userId}`, SUGGESTIONS_PER_MINUTE, 60_000, now);
  if (!limit.ok) {
    return json({ error: "rate_limited" }, 429, { "Retry-After": String(Math.max(1, Math.ceil(limit.retryAfterMs / 1000))) });
  }

  return json({ suggestions: await run(userId, query) });
}
