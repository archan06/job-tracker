type CityParts = { city?: string; state?: string; state_code?: string; country?: string };

/** "Toronto, ON, Canada" from a geocoder result, or null when it has no city. */
export function formatCityLabel({ city, state, state_code, country }: CityParts): string | null {
  if (!city?.trim()) return null;
  return [city, state_code || state, country]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");
}
