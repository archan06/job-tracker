import { getPublicOrigin } from "mcp-handler";

/** This deployment's public origin (respects Vercel's forwarding headers). It's also the OAuth issuer. */
export const publicOrigin = (request: Request) => getPublicOrigin(request);

/** The one resource tokens are issued for: the MCP endpoint. */
export const mcpResource = (origin: string) => `${origin}/api/mcp`;

/** The public origin inside pages and Server Actions, which only have the request headers. */
export function originFromHeaders(headers: Headers): string {
  return getPublicOrigin(new Request(`http://${headers.get("host") ?? "localhost"}/`, { headers }));
}
