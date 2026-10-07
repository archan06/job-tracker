import { formatCityLabel } from "@/lib/location";
import type { PlaceDirectory } from "./types";

type AutocompleteResponse = { results?: Parameters<typeof formatCityLabel>[0][] };

/** Geoapify city autocomplete, worldwide. */
export function geoapifyDirectory(apiKey: string, fetchImpl: typeof fetch = fetch): PlaceDirectory {
  return {
    async searchCities(query, signal) {
      const params = new URLSearchParams({ text: query, type: "city", format: "json", limit: "6", apiKey });
      const response = await fetchImpl(`https://api.geoapify.com/v1/geocode/autocomplete?${params}`, { signal });
      if (!response.ok) throw new Error(`Geoapify autocomplete failed: ${response.status}`);
      const body = (await response.json()) as AutocompleteResponse;
      const labels = (body.results ?? []).map(formatCityLabel).filter((label): label is string => label !== null);
      return [...new Set(labels)].map((label) => ({ label }));
    },
  };
}
