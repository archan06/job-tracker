type CityParts = { city?: string; state?: string; state_code?: string; country?: string };

/** "Toronto, ON, Canada" from a geocoder result, or null when it has no city. */
export function formatCityLabel({ city, state, state_code, country }: CityParts): string | null {
  if (!city?.trim()) return null;
  return [city, state_code || state, country]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");
}

/** Picking "Hybrid…" starts the value with this; the city picked next completes it. */
export const HYBRID_PREFIX = "Hybrid · ";

/** The city part of a location value: what to search for. */
export function cityQuery(value: string): string {
  const trimmed = value.trimStart();
  return (trimmed.startsWith(HYBRID_PREFIX) ? trimmed.slice(HYBRID_PREFIX.length) : trimmed).trim();
}

/** The value after picking a city: keeps a hybrid prefix the user already chose. */
export function applyCityPick(current: string, label: string): string {
  return current.trimStart().startsWith(HYBRID_PREFIX) ? `${HYBRID_PREFIX}${label}` : label;
}
