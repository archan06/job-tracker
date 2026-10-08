import type { OAuthClient } from "@/generated/prisma/client";
import { parseScopes, type Scope } from "@/lib/oauth/params";
import { resolveClient } from "./clients";
import { MAX_CLIENT_ID_LENGTH } from "./http";
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
  /**
   * Shown on Landed's own error page. Errors are never redirected to the client: anyone can register
   * a client, so redirecting errors would make Landed an open redirector (RFC 9700 §4.11.2).
   */
  | { ok: false; message: string };

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
  if (!clientId || clientId.length > MAX_CLIENT_ID_LENGTH) return { ok: false, message: "This link is missing the app's client_id." };
  const client = await resolveClient(clientId);
  if (!client) return { ok: false, message: "This app isn't registered with Landed." };

  const redirectUri = params.redirect_uri ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : undefined);
  if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
    return { ok: false, message: "This app asked to send you to an address it didn't register, so Landed stopped here." };
  }

  const state = params.state ?? null;
  const fail = (message: string): AuthorizeResult => ({ ok: false, message: `${client.name} sent an invalid request: ${message}` });

  if (params.response_type !== "code") return fail("only response_type=code is supported.");
  if (params.code_challenge_method !== "S256" || !CHALLENGE.test(params.code_challenge ?? "")) {
    return fail("PKCE with code_challenge_method=S256 is required.");
  }
  const scopes = parseScopes(params.scope);
  if (!scopes) return fail("it asked for permissions Landed doesn't offer.");
  const resource = mcpResource(origin);
  if (params.resource && params.resource !== resource) return fail("it asked for an unknown resource.");

  return { ok: true, request: { client, redirectUri, state, scopes, codeChallenge: params.code_challenge!, resource } };
}
