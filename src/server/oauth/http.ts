/** CORS for OAuth endpoints: browser-based MCP clients call them cross-origin. Tokens are bearer-only, never cookies. */
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version",
};

export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function noStoreJson(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store", ...CORS_HEADERS } });
}
