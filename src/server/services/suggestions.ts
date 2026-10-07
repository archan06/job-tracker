import { db } from "@/server/db";
import type { CompanyDirectory, CompanySuggestion, LocationSuggestion, PlaceDirectory } from "@/server/suggest/types";

/** How long a suggestion provider gets before the user just sees what we have. */
export const PROVIDER_TIMEOUT_MS = 3000;
const MAX_RECENT = 5;
const MAX_CITIES = 6;

const MAX_COMPANIES = 8;

/** The user's own companies first, then directory matches that aren't already listed. */
export function mergeCompanySuggestions(
  recent: { name: string; domain: string | null }[],
  directory: { name: string; domain: string }[],
): CompanySuggestion[] {
  const remaining = directory.map((d) => ({ ...d, domain: d.domain.toLowerCase() }));
  const merged: CompanySuggestion[] = recent.map(({ name, domain }) => {
    if (domain) return { name, domain, source: "recent" };
    // A past entry typed without a website borrows the directory's, if the names match.
    const match = remaining.find((d) => d.name.toLowerCase() === name.toLowerCase());
    return { name, domain: match?.domain ?? null, source: "recent" };
  });
  const seen = new Set(merged.map((s) => s.domain).filter(Boolean));
  for (const d of remaining) {
    if (seen.has(d.domain)) continue;
    seen.add(d.domain);
    merged.push({ name: d.name, domain: d.domain, source: "directory" });
  }
  return merged.slice(0, MAX_COMPANIES);
}

/** A provider call that can't fail or hang: errors and timeouts become an empty list. */
async function settle<T>(call: (signal: AbortSignal) => Promise<T[]>): Promise<T[]> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`timed out after ${PROVIDER_TIMEOUT_MS}ms`));
    }, PROVIDER_TIMEOUT_MS);
  });
  try {
    return await Promise.race([call(controller.signal), timeout]);
  } catch (error) {
    console.warn("suggest provider failed", error);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Prisma passes `contains` straight to ILIKE, so `%` and `_` would act as wildcards. */
function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/** The user's own past companies matching the query: one row per name, newest first, with the latest saved website. */
async function recentCompanies(userId: string, query: string) {
  const rows = await db.application.findMany({
    where: { userId, company: { contains: escapeLike(query), mode: "insensitive" } },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    select: { company: true, companyDomain: true },
    take: 50,
  });
  const byName = new Map<string, { name: string; domain: string | null }>();
  for (const { company, companyDomain } of rows) {
    const key = company.toLowerCase();
    const entry = byName.get(key);
    if (!entry) byName.set(key, { name: company, domain: companyDomain });
    else entry.domain ??= companyDomain;
  }
  return [...byName.values()].slice(0, MAX_RECENT);
}

export async function suggestCompanies(userId: string, query: string, directory: CompanyDirectory): Promise<CompanySuggestion[]> {
  const [recent, found] = await Promise.all([
    recentCompanies(userId, query),
    settle((signal) => directory.search(query, signal)),
  ]);
  return mergeCompanySuggestions(recent, found);
}

export async function suggestLocations(query: string, directory: PlaceDirectory): Promise<LocationSuggestion[]> {
  const cities = await settle((signal) => directory.searchCities(query, signal));
  return [...new Set(cities.map((c) => c.label))].slice(0, MAX_CITIES).map((label) => ({ label }));
}
