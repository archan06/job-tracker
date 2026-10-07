export type CompanySuggestion = { name: string; domain: string | null; source: "recent" | "directory" };
export type LocationSuggestion = { label: string };

/** A searchable list of companies with their websites (Logo.dev in production). */
export interface CompanyDirectory {
  search(query: string, signal?: AbortSignal): Promise<{ name: string; domain: string }[]>;
}

/** A searchable list of cities (Geoapify in production). */
export interface PlaceDirectory {
  searchCities(query: string, signal?: AbortSignal): Promise<LocationSuggestion[]>;
}
