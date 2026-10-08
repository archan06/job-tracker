import { revokeToken } from "@/server/oauth/grants";
import { CORS_HEADERS, corsPreflight } from "@/server/oauth/http";

export const OPTIONS = corsPreflight;

/** RFC 7009 token revocation. Always 200, so it can't be used to probe which tokens exist. */
export async function POST(request: Request) {
  const token = new URLSearchParams(await request.text().catch(() => "")).get("token");
  if (token) await revokeToken(token);
  return new Response(null, { status: 200, headers: { "Cache-Control": "no-store", ...CORS_HEADERS } });
}
