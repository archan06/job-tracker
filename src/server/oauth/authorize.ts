import type { OAuthClient } from "@/generated/prisma/client";
import { parseScopes, type Scope } from "@/lib/oauth/params";
import { resolveClient } from "./clients";
import { mcpResource } from "./urls";

const CHALLENGE = /^[A-Za-z0-9_-]{43,128}$/;

export type AuthorizeRequest = {
  client: OAuthClient;
  redirectUri: string;
  state: string | null;
  scopes: Scope[];
  codeChallenge: string;
  resource: string;
};

export type AuthorizeResult =
  | { ok: true; request: AuthorizeRequest }
  /** `redirect` is set only once the client and redirect URI are trusted; otherwise show `message` and never redirect. */
  | { ok: false; message: string; redirect?: URL };

/** The redirect back to the client carrying an OAuth error (or, with `code`, a success). Always includes `iss` (RFC 9207). */
export function clientRedirect(redirectUri: string, origin: string, state: string | null, params: Record<string, string>): URL {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  if (state !== null) url.searchParams.set("state", state);
  url.searchParams.set("iss", origin);
  return url;
}

/** Checks an /oauth/authorize request. Used both to show the consent page and again when the user decides. */
export async function validateAuthorizeRequest(params: Record<string, string | undefined>, origin: string): Promise<AuthorizeResult> {
  const clientId = params.client_id;
  if (!clientId) return { ok: false, message: "This link is missing the app's client_id." };
  const client = await resolveClient(clientId);
  if (!client) return { ok: false, message: "This app isn't registered with Landed." };

  const redirectUri = params.redirect_uri ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : undefined);
  if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
    return { ok: false, message: "This app asked to send you to an address it didn't register, so Landed stopped here." };
  }

  const state = params.state ?? null;
  const fail = (error: string, description: string): AuthorizeResult => ({
    ok: false,
    message: description,
    redirect: clientRedirect(redirectUri, origin, state, { error, error_description: description }),
  });

  if (params.response_type !== "code") return fail("unsupported_response_type", "Only response_type=code is supported");
  if (params.code_challenge_method !== "S256" || !CHALLENGE.test(params.code_challenge ?? "")) {
    return fail("invalid_request", "PKCE with code_challenge_method=S256 is required");
  }
  const scopes = parseScopes(params.scope);
  if (!scopes) return fail("invalid_scope", "Unknown scope requested");
  const resource = mcpResource(origin);
  if (params.resource && params.resource !== resource) return fail("invalid_target", "Unknown resource");

  return { ok: true, request: { client, redirectUri, state, scopes, codeChallenge: params.code_challenge!, resource } };
}
