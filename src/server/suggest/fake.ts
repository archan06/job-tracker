import type { CompanyDirectory, PlaceDirectory } from "./types";

// Fixed data for end-to-end tests (SUGGEST_PROVIDER=fake), so they never call real services.
const COMPANIES = [
  { name: "Stripe", domain: "stripe.com" },
  { name: "Playwright Inc", domain: "playwright.dev" },
  { name: "Shopify", domain: "shopify.com" },
  { name: "Spotify", domain: "spotify.com" },
];

const CITIES = ["Toronto, ON, Canada", "Torrance, CA, United States", "New York, NY, United States", "Torino, Piedmont, Italy"];

const matches = (text: string, query: string) => text.toLowerCase().includes(query.toLowerCase());

export const fakeCompanyDirectory: CompanyDirectory = {
  search: async (query) => COMPANIES.filter((c) => matches(c.name, query)),
};

export const fakePlaceDirectory: PlaceDirectory = {
  searchCities: async (query) => CITIES.filter((label) => matches(label, query)).map((label) => ({ label })),
};
