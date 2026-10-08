import { OAuthError } from "@/server/oauth/errors";
import { exchangeCode, refreshGrant } from "@/server/oauth/grants";
import { CORS_HEADERS, corsPreflight, noStoreJson } from "@/server/oauth/http";
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
    if (!clientId) throw new OAuthError("invalid_request", "client_id is required");
    const limit = await rateLimit(`oauth:token:${clientId}`, TOKEN_REQUESTS_PER_MINUTE, 60_000);
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
