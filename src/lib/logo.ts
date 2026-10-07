/** Logo.dev CDN image for a domain, or null when no publishable key is configured. */
export function logoUrl(domain: string, px: number): string | null {
  const token = process.env.NEXT_PUBLIC_LOGO_DEV_PUBLISHABLE_KEY;
  if (!token) return null;
  // fallback=404 makes unknown companies fail to load, so the app shows its own initials avatar.
  const params = new URLSearchParams({ token, size: String(px), retina: "true", format: "webp", fallback: "404" });
  return `https://img.logo.dev/${encodeURIComponent(domain)}?${params}`;
}
