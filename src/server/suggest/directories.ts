import { cacheLife } from "next/cache";
import { spendProviderBudget } from "@/server/services/rate-limit";
import { PROVIDER_TIMEOUT_MS } from "@/server/services/suggestions";
import { fakeCompanyDirectory, fakePlaceDirectory } from "./fake";
import { geoapifyDirectory } from "./geoapify";
import { logoDevDirectory } from "./logo-dev";
import type { CompanyDirectory, PlaceDirectory } from "./types";

// The same search from anyone gives the same answer, so results are shared for a day in the
// remote cache (in-memory caches don't survive between serverless instances). Each cache miss
// spends from a global daily budget, so heavy use can't exhaust a provider's free tier for
// everyone. Failed or over-budget lookups throw, so they're never cached.

async function cachedCompanySearch(query: string) {
  "use cache: remote";
  cacheLife("days");
  await spendProviderBudget("logodev");
  return logoDevDirectory(process.env.LOGO_DEV_SECRET_KEY!).search(query, AbortSignal.timeout(PROVIDER_TIMEOUT_MS));
}

async function cachedCitySearch(query: string) {
  "use cache: remote";
  cacheLife("days");
  await spendProviderBudget("geoapify");
  return geoapifyDirectory(process.env.GEOAPIFY_API_KEY!).searchCities(query, AbortSignal.timeout(PROVIDER_TIMEOUT_MS));
}

const normalize = (query: string) => query.trim().toLowerCase();
const fake = () => process.env.SUGGEST_PROVIDER === "fake";

/** Logo.dev in production, fixed data in end-to-end tests, nothing when no key is set. */
export function companyDirectory(): CompanyDirectory {
  if (fake()) return fakeCompanyDirectory;
  if (!process.env.LOGO_DEV_SECRET_KEY) return { search: async () => [] };
  return { search: (query) => cachedCompanySearch(normalize(query)) };
}

/** Geoapify in production, fixed data in end-to-end tests, nothing when no key is set. */
export function placeDirectory(): PlaceDirectory {
  if (fake()) return fakePlaceDirectory;
  if (!process.env.GEOAPIFY_API_KEY) return { searchCities: async () => [] };
  return { searchCities: (query) => cachedCitySearch(normalize(query)) };
}
