import { generateProtectedResourceMetadata } from "mcp-handler";
import { SCOPES } from "@/lib/oauth/params";
import { CORS_HEADERS, corsPreflight } from "@/server/oauth/http";
import { mcpResource, publicOrigin } from "@/server/oauth/urls";

export const OPTIONS = corsPreflight;

/** RFC 9728 protected resource metadata, served at the root and at the /api/mcp path-suffixed location. */
export function GET(request: Request) {
  const origin = publicOrigin(request);
  const metadata = generateProtectedResourceMetadata({
    authServerUrls: [origin],
    resourceUrl: mcpResource(origin),
    additionalMetadata: { scopes_supported: [...SCOPES], resource_name: "Landed" },
  });
  return Response.json(metadata, { headers: CORS_HEADERS });
}
