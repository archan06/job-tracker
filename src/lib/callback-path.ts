const PROBE_ORIGIN = "http://landed.invalid";

/**
 * Where to go after signing in: only same-site paths, so a crafted link can't bounce users to
 * another site. Resolves the value the way a browser would (URL parsing drops tabs and newlines,
 * so "/\t/evil.com" becomes "//evil.com") and accepts it only if it stays on this origin.
 */
export function safeCallbackPath(raw: string | null | undefined, fallback = "/board"): string {
  if (!raw || !raw.startsWith("/") || /[\x00-\x1f\x7f\\]/.test(raw)) return fallback;
  let url: URL;
  try {
    url = new URL(raw, PROBE_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== PROBE_ORIGIN || url.pathname.startsWith("//")) return fallback;
  return `${url.pathname}${url.search}`;
}
