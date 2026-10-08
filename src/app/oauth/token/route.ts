import { OAuthError } from "@/server/oauth/errors";
import { exchangeCode, refreshGrant } from "@/server/oauth/grants";
import { clientIp } from "@/server/client-ip";
import { CORS_HEADERS, MAX_CLIENT_ID_LENGTH, corsPreflight, noStoreJson } from "@/server/oauth/http";
import { rateLimit } from "@/server/services/rate-limit";

const TOKEN_REQUESTS_PER_MINUTE = 60;

export const OPTIONS = corsPreflight;

async function readForm(request: Request): Promise<URLSearchParams> {
  try {
    return new URLSearchParams(await request.text());
  } catch {
    return new URLSearchParams();
  }
}

/** OAuth token endpoint: authorization_code (with PKCE) and refresh_token grants, for public clients. */
export async function POST(request: Request) {
  const params = await readForm(request);
  const field = (name: string) => params.get(name) ?? "";
  const clientId = field("client_id");
  try {
    if (!clientId || clientId.length > MAX_CLIENT_ID_LENGTH) throw new OAuthError("invalid_request", "A valid client_id is required");
    // Per network and client: a client_id is public, so limiting by it alone would let anyone lock out its real users.
    const limit = await rateLimit(`oauth:token:${clientIp(request.headers)}:${clientId}`, TOKEN_REQUESTS_PER_MINUTE, 60_000);
    if (!limit.ok) throw new OAuthError("slow_down", "Too many token requests. Try again shortly.", 429);
    const resource = params.get("resource") ?? undefined;
    switch (field("grant_type")) {
      case "authorization_code": {
        if (!field("code") || !field("redirect_uri") || !field("code_verifier")) {
          throw new OAuthError("invalid_request", "code, redirect_uri and code_verifier are required");
        }
        return noStoreJson(
          await exchangeCode({ code: field("code"), clientId, redirectUri: field("redirect_uri"), codeVerifier: field("code_verifier"), resource }),
        );
      }
      case "refresh_token": {
        if (!field("refresh_token")) throw new OAuthError("invalid_request", "refresh_token is required");
        return noStoreJson(await refreshGrant({ refreshToken: field("refresh_token"), clientId, resource }));
      }
      default:
        throw new OAuthError("unsupported_grant_type", "Only authorization_code and refresh_token are supported");
    }
  } catch (error) {
    if (error instanceof OAuthError) return error.toResponse(CORS_HEADERS);
    throw error;
  }
}
