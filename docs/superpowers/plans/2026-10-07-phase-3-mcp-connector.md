# Phase 3: MCP Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans to implement this plan task-by-task.

**Goal:** Claude and ChatGPT can connect to Landed through OAuth 2.1 and read, add and update the signed-in user's applications.

**Architecture:** Landed is its own authorization server:
- Pure helpers in `src/lib/oauth/*`
- Database logic in `src/server/oauth/*` (services with injected `now`)
- Thin route handlers under `src/app/oauth/*` and `src/app/.well-known/*`

The MCP endpoint (`src/app/api/mcp/route.ts`) wraps `createMcpHandler` with `withMcpAuth`. Its `verifyToken` looks the token hash up in `OAuthGrant`. Tools live in `src/server/mcp/tools.ts` and call the existing services.

**Tech Stack:** Next.js 16.4, Prisma 7, Auth.js v5, Zod 4, mcp-handler 2.3, @modelcontextprotocol/server 2.3, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-07-phase-3-mcp-connector-design.md`

## Global Constraints

- Resource URL: `${origin}/api/mcp`. Issuer: `${origin}`. Origin comes from `getPublicOrigin(req)` (mcp-handler).
- Scopes: `applications:read`, `applications:write`. Lifetimes: code 60 s, access 1 h, refresh 30 d.
- Tokens: 32 random bytes, base64url. Stored as SHA-256 hex.
- PKCE: S256 only. `code_verifier` is 43-128 characters of `[A-Za-z0-9-._~]`.
- Rate limits:
  - `oauth:register:{ip}` 20 per hour
  - `oauth:token:{clientId}` 60 per minute
  - `mcp:{userId}` 120 per minute
- No delete tool. Tool errors use `isError: true` with plain-English text.
- Read the Next docs in `node_modules/next/dist/docs/` before writing route handlers or server actions.

## Review Focus

1. **Open redirect:** an invalid `client_id` or `redirect_uri` must never redirect. It shows an error page.
2. **Token confusion:** a refresh token used as an access token (and the other way round) must fail. So must a code from client A redeemed by client B, and a token for another resource.
3. **SSRF via CIMD:** `https://127.0.0.1/…`, `https://localhost/…`, a hostname resolving to `10.x` or `169.254.x`, redirects, and huge bodies are all rejected.
4. **Revoked or expired grants** are refused at `/api/mcp`, even if the token hash still matches.
5. **Cross-user access:** user B's token can never read or update user A's application by id.

---

### Task 1: OAuth schema and pure helpers
- Prisma models `OAuthClient`, `OAuthCode`, `OAuthGrant` and enum `OAuthClientKind`, per the spec, plus a migration.
- `src/lib/oauth/crypto.ts`:
  - `randomToken(): string`
  - `hashToken(t: string): string`
  - `verifyPkce(verifier: string, challenge: string): boolean`
- `src/lib/oauth/params.ts`:
  - `SCOPES`
  - `parseScopes(raw: string | null): string[] | null` (null means an unknown scope was requested; empty means grant both)
  - `isAllowedRedirectUri(uri: string): boolean` (https, or http on localhost/127.0.0.1; no fragment)
- Unit tests first: RFC 7636 appendix B vector (`dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk` gives `E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM`), a wrong verifier, a short verifier, scope cases, and redirect cases (javascript:, http non-local, fragment).

### Task 2: Client registration (DCR and CIMD)
- `src/server/oauth/clients.ts`:
  - `registerClient(body: unknown, now?): Promise<{ client_id, client_name, redirect_uris, token_endpoint_auth_method: "none", ... }>` (validated with zod, rejects unsafe URIs)
  - `resolveClient(clientId: string, deps?: { fetchMetadata?, now? }): Promise<OAuthClient | null>` (DCR from the database; CIMD fetched, validated and cached for 24 h)
- `src/server/oauth/cimd.ts`: `fetchClientMetadata(url: string, deps?: { lookup?, fetch? })`, with the guards from the spec (DNS lookup checked against private ranges, `redirect: "manual"`, 5 s, 64 KB).
- Route `src/app/oauth/register/route.ts` (POST, 201 JSON, 400 `invalid_client_metadata`, 429).
- Tests: unit tests for the CIMD guard and validation, using stub lookup/fetch. Integration tests for register and resolve (DCR, CIMD cache).

### Task 3: Codes, tokens, revocation and metadata
- `src/server/oauth/grants.ts`:
  - `createAuthorizationCode({ clientId, userId, redirectUri, codeChallenge, scopes, resource }, now?) → code`
  - `exchangeCode({ code, clientId, redirectUri, codeVerifier, resource? }, now?) → TokenResponse | OAuthError`
  - `refreshGrant({ refreshToken, clientId, resource? }, now?)`
  - `revokeToken(token)`
  - `verifyAccessToken(token, resource, now?) → { userId, clientId, scopes, expiresAt } | null` (also updates `lastUsedAt`)
  - `listGrants(userId)`
  - `disconnectGrant(userId, grantId)`
- A user + client pair reuses one grant: re-authorizing replaces its tokens and scopes.
- Routes: `/oauth/token` (form-encoded, `Cache-Control: no-store`), `/oauth/revoke`, and the two `.well-known` routes (plus the `/api/mcp` suffix variant). CORS is open on metadata and token.
- Integration tests for every Review Focus 2 and 4 case, code reuse, expiry, refresh rotation and reuse revocation, and revoke.

### Task 4: Authorize and consent
- `src/app/oauth/authorize/page.tsx` (validates through `src/server/oauth/authorize.ts: validateAuthorizeRequest(params, origin)`, which returns `{ ok: true, request } | { ok: false, redirect?: URL, message }`).
- Signed out: redirect to `/login?callbackUrl=<this url>`.
- Consent UI with Allow/Deny server actions that re-validate and then redirect.
- The login form must honour `callbackUrl` (same-origin paths only).
- The proxy (`auth.config.ts`) lets `/oauth/`, `/.well-known/` and `/api/mcp` through.
- Unit tests for `validateAuthorizeRequest` (Review Focus 1). E2E: register a client with `fetch`, open authorize, sign in, Allow, land on the redirect URI with `code` + `state` + `iss`.

### Task 5: MCP endpoint and tools
- `src/server/mcp/tools.ts`: `registerLandedTools(server: McpServer)`. Each tool reads `ctx.http?.authInfo?.extra?.userId`. Write tools set `scopeChallenge: requireScopes("applications:write")`, and read tools set `requireScopes("applications:read")`.
- `src/app/api/mcp/route.ts`: `withMcpAuth(handler, verify, { required: true, resourceMetadataPath: "/.well-known/oauth-protected-resource/api/mcp" })` exported as GET/POST/DELETE.
- Integration tests: call tool handlers through an in-process MCP client, or invoke the route handler with a minted token. Cover every tool, the scope denial, Review Focus 5, and the read rate limit.

### Task 6: Connected apps page
- `src/app/(app)/settings/connections/page.tsx`, with a user menu link and a Disconnect server action calling `disconnectGrant`.
- E2E: after consent, the page lists the client. Disconnect removes it, and the old token then gets 401 at `/api/mcp`.
