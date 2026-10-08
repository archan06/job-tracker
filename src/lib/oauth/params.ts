export const SCOPES = ["applications:read", "applications:write"] as const;
export type Scope = (typeof SCOPES)[number];

export const SCOPE_LABELS: Record<Scope, string> = {
  "applications:read": "View your applications",
  "applications:write": "Add and update applications",
};

/**
 * The granted scopes, in canonical order: the requested ones Landed knows (others, like "openid", are
 * ignored). Nothing requested means both; only unknown scopes means null (invalid_scope).
 */
export function parseScopes(raw: string | null | undefined): Scope[] | null {
  const requested = (raw ?? "").split(/\s+/).filter(Boolean);
  if (requested.length === 0) return [...SCOPES];
  const known = SCOPES.filter((s) => requested.includes(s));
  return known.length > 0 ? known : null;
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Redirect URIs a client may register: https anywhere, or http on loopback (desktop tools). No fragments or credentials. */
export function isAllowedRedirectUri(uri: string): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.hash || url.username || url.password) return false;
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && LOOPBACK.has(url.hostname);
}
