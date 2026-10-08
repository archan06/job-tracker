import type { AuthInfo } from "@modelcontextprotocol/server";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { registerLandedTools } from "@/server/mcp/server";
import { verifyAccessToken } from "@/server/oauth/grants";
import { CORS_HEADERS, corsPreflight } from "@/server/oauth/http";
import { mcpResource, publicOrigin } from "@/server/oauth/urls";

const mcp = createMcpHandler(registerLandedTools, {
  serverInfo: { name: "Landed", version: "1.0.0" },
  instructions: "Landed is the user's job application tracker. Use these tools to look up, add and update their applications.",
});

async function verifyToken(request: Request, bearer?: string): Promise<AuthInfo | undefined> {
  if (!bearer) return undefined;
  const resource = mcpResource(publicOrigin(request));
  const verified = await verifyAccessToken(bearer, resource);
  if (!verified) return undefined;
  return {
    token: bearer,
    clientId: verified.clientId,
    scopes: verified.scopes,
    expiresAt: Math.floor(verified.expiresAt.getTime() / 1000),
    resource: new URL(resource),
    extra: { userId: verified.userId },
  };
}

const handler = withMcpAuth(mcp, verifyToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource/api/mcp",
});

async function withCors(request: Request) {
  const response = await handler(request);
  for (const [key, value] of Object.entries(CORS_HEADERS)) response.headers.set(key, value);
  response.headers.set("Access-Control-Expose-Headers", "WWW-Authenticate, MCP-Session-Id");
  return response;
}

export { withCors as GET, withCors as POST, withCors as DELETE };
export const OPTIONS = corsPreflight;
