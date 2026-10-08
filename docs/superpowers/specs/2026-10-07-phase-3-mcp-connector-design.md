# Phase 3: Claude and ChatGPT connector (MCP + OAuth)

Date: 2026-10-07
Status: Approved in conversation (sections 1-3). The user asked to skip the written-review stops.

## Goal

Let a Landed user connect Claude or ChatGPT to their board, so the assistant can read, add and update *that user's* applications, and nothing else.

## Decisions

| Topic | Decision |
|---|---|
| Permissions | Read + add + update. No delete. |
| Auth approach | Landed is its own OAuth 2.1 authorization server (no third-party identity provider) |
| Client registration | Client ID Metadata Documents (CIMD, preferred by MCP 2026-07-28) **and** Dynamic Client Registration (DCR, still required by ChatGPT) |
| MCP transport | `mcp-handler` 2.x + `@modelcontextprotocol/server` 2.x, stateless Streamable HTTP at `/api/mcp` |
| Scopes | `applications:read`, `applications:write` |

## Standards

- MCP authorization 2026-07-28: OAuth 2.1 authorization code + PKCE (S256 only), RFC 9728 protected resource metadata, RFC 8414 authorization server metadata, RFC 8707 `resource` parameter, RFC 9207 `iss` in the authorization response, CIMD, DCR (RFC 7591).
- The MCP server rejects tokens not issued for its resource (`<origin>/api/mcp`).

## Data model

```prisma
model OAuthClient {
  id           String   @id            // client_id: random for DCR, the metadata URL for CIMD
  name         String
  redirectUris String[]
  kind         OAuthClientKind          // DCR | CIMD
  createdAt    DateTime @default(now())
}

model OAuthCode {
  codeHash      String   @id
  clientId      String
  userId        String
  redirectUri   String
  codeChallenge String
  scopes        String[]
  resource      String
  expiresAt     DateTime                // 60 s
  usedAt        DateTime?
}

model OAuthGrant {                      // one connection: a user + a client
  id               String    @id @default(cuid())
  userId           String
  clientId         String
  clientName       String
  scopes           String[]
  resource         String
  accessTokenHash  String?   @unique
  accessExpiresAt  DateTime?            // 1 h
  refreshTokenHash String?   @unique
  refreshExpiresAt DateTime?            // 30 d, rotated on every use
  /// Hashes of refresh tokens already rotated out; presenting one revokes the grant.
  retiredRefreshHashes String[]
  createdAt        DateTime  @default(now())
  lastUsedAt       DateTime?
  revokedAt        DateTime?
}
```

Users cascade to codes and grants. Tokens are 32 random bytes (base64url) and stored as SHA-256 hashes, so the raw value is never stored or logged.

## Endpoints

| Path | Purpose |
|---|---|
| `GET /.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/api/mcp` | RFC 9728: resource `<origin>/api/mcp`, authorization server `<origin>`, scopes |
| `GET /.well-known/oauth-authorization-server` | RFC 8414: issuer, endpoints, `code_challenge_methods_supported: ["S256"]`, `grant_types_supported: ["authorization_code","refresh_token"]`, `token_endpoint_auth_methods_supported: ["none"]`, `client_id_metadata_document_supported: true`, `authorization_response_iss_parameter_supported: true`, `scopes_supported` |
| `POST /oauth/register` | DCR. Public clients only (`token_endpoint_auth_method: none`). The redirect URIs must be https, or http on localhost/127.0.0.1. Rate limited to 20 per hour per IP. |
| `GET /oauth/authorize` | Validates the client, redirect URI, PKCE, scope and resource. If signed out, redirects to `/login?callbackUrl=…`. Otherwise shows the consent page. |
| `POST` consent (server action) | Allow creates a code and redirects to `redirect_uri?code&state&iss`. Deny redirects with `error=access_denied&state&iss`. |
| `POST /oauth/token` | `authorization_code` (PKCE verify, single use, exact redirect URI, matching client and resource) and `refresh_token` (rotation, reuse detection). Rate limited to 60 per minute per client. |
| `POST /oauth/revoke` | RFC 7009. Revokes the grant that owns the token. Always returns 200. |
| `/api/mcp` | The MCP endpoint, wrapped in `withMcpAuth` |

### Authorization request rules
- `response_type=code`, `code_challenge_method=S256` and a `code_challenge` are required.
- `redirect_uri` must exactly match one of the client's registered URIs.
- Scopes: the requested set intersected with the supported scopes. If no scope is requested, both are granted.
- `resource`, if present, must equal `<origin>/api/mcp`.
- If the client or redirect URI is invalid, an error page is shown and the browser is never redirected. Every other error redirects back to the client with `error`.

### CIMD
A `client_id` that is an https URL with a path triggers a fetch of that URL with these guards:
- https only
- the host must not resolve to a private, loopback or link-local address
- a 5 s timeout, no redirects, and a 64 KB limit
- the JSON `client_id` must equal the URL
- `redirect_uris` must be a non-empty array of URLs

Results are cached in `OAuthClient` and refreshed after 24 hours.

## MCP tools

All tools call the existing services with the token's `userId`. Reads need `applications:read`, and writes need `applications:write` (enforced per tool with `requireScopes`).

| Tool | Scope | Notes |
|---|---|---|
| `search_applications` | read | `company?`, `statuses?`, `sources?`, `sort?`, `dir?`, `limit` 1-50 (default 20) |
| `get_application` | read | Full record with timeline |
| `pipeline_summary` | read | Counts per status, plus stale (APPLIED or INTERVIEW, `updatedAt` older than 14 days) |
| `add_application` | write | Validated by `applicationInputSchema` |
| `update_application` | write | Partial. Merged onto the current record, then validated by `applicationInputSchema` |
| `change_status` | write | Uses `changeStatus` |
| `add_timeline_entry` | write | `eventInputSchema`. Date defaults to today (UTC) |

- Reads are limited to 120 per minute per user (`mcp:{userId}`). Writes also use the existing `enforceWriteLimit`.
- Errors are returned as tool errors (`isError: true`) with the website's plain-English messages. `NotFoundError` reads "Application not found".

## Connected apps page

`/settings/connections` is linked from the user menu. It lists the active grants (client name, scopes, connected date, last used) with a **Disconnect** button (a server action that sets `revokedAt` and clears the token hashes). It also has a "How to connect" section showing the connector URL.

## Security

- Exact redirect URI matching; PKCE S256 only; codes are single-use and last 60 s.
- Tokens are hashed at rest. The access token lifetime is 1 h. Refresh tokens rotate, and reusing a retired one revokes the grant.
- A token must have an unrevoked grant, be unexpired, and have `resource === <origin>/api/mcp`.
- The consent page shows the client name and redirect host, plus an "Unverified app" note for DCR clients. It's a Server Action form (CSRF-protected), and framing is denied by existing headers.
- `/oauth/*`, `/.well-known/*` and `/api/mcp` bypass the page login redirect. `/oauth/authorize` handles sign-in itself.

## Testing

- **Unit:** PKCE verification, redirect URI validation, scope parsing, CIMD document validation and the private-address guard, token generation and hashing.
- **Integration:**
  - The full DCR flow: authorize → token → tool call
  - Code reuse and expiry
  - Refresh rotation and reuse revocation
  - Revoke and disconnect
  - Read-only tokens can't write
  - Cross-user isolation
  - The resource mismatch is rejected
  - Each tool's happy path and error path
- **End-to-end:** consent Allow, the connection is listed, Disconnect.
- **Manual after deploy:** connect real Claude and ChatGPT.
