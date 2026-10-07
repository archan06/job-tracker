import { normalizeDomain } from "@/lib/company-domain";
import type { CompanyDirectory } from "./types";

type SearchResponse = { data?: { name?: string; domain?: string }[] };

/** Logo.dev Brand Search. Typeahead mode matches name prefixes ("stri" → Stripe), which is what a search box needs. */
export function logoDevDirectory(secretKey: string, fetchImpl: typeof fetch = fetch): CompanyDirectory {
  return {
    async search(query, signal) {
      const params = new URLSearchParams({ q: query, limit: "8", method: "typeahead" });
      const response = await fetchImpl(`https://api.logo.dev/v2/search?${params}`, {
        headers: { Authorization: `Bearer ${secretKey}` },
        signal,
      });
      if (!response.ok) throw new Error(`Logo.dev search failed: ${response.status}`);
      const body = (await response.json()) as SearchResponse;
      return (body.data ?? []).flatMap(({ name, domain }) => {
        const normalized = domain ? normalizeDomain(domain) : null;
        return name?.trim() && normalized ? [{ name: name.trim(), domain: normalized }] : [];
      });
    },
  };
}
