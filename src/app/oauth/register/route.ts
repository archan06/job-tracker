import { clientIp } from "@/server/client-ip";
import { registerClient } from "@/server/oauth/clients";
import { OAuthError } from "@/server/oauth/errors";
import { CORS_HEADERS, corsPreflight, noStoreJson } from "@/server/oauth/http";
import { rateLimit } from "@/server/services/rate-limit";

const REGISTRATIONS_PER_HOUR = 20;

export const OPTIONS = corsPreflight;

/** Dynamic Client Registration (RFC 7591). */
export async function POST(request: Request) {
  const limit = await rateLimit(`oauth:register:${clientIp(request.headers)}`, REGISTRATIONS_PER_HOUR, 60 * 60_000);
  if (!limit.ok) {
    return new OAuthError("slow_down", "Too many registrations. Try again later.", 429).toResponse({
      ...CORS_HEADERS,
      "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)),
    });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new OAuthError("invalid_client_metadata", "Body must be JSON").toResponse(CORS_HEADERS);
  }
  try {
    return noStoreJson(await registerClient(body), 201);
  } catch (error) {
    if (error instanceof OAuthError) return error.toResponse(CORS_HEADERS);
    throw error;
  }
}
