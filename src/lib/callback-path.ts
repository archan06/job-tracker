/** Where to go after signing in: only same-site paths, so a crafted link can't bounce users to another site. */
export function safeCallbackPath(raw: string | null | undefined, fallback = "/board"): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  return raw;
}
