import { createHash } from "node:crypto";
import { beforeEach, expect, test } from "vitest";
import { GET as authServerMetadata } from "@/app/.well-known/oauth-authorization-server/route";
import { GET as resourceMetadata } from "@/app/.well-known/oauth-protected-resource/[[...path]]/route";
import { POST as revoke } from "@/app/oauth/revoke/route";
import { POST as token } from "@/app/oauth/token/route";
import { db } from "@/server/db";
import { registerClient } from "@/server/oauth/clients";
import { createAuthorizationCode, verifyAccessToken } from "@/server/oauth/grants";
import { makeUser } from "./factories";

const ORIGIN = "https://landed.test";
const RESOURCE = `${ORIGIN}/api/mcp`;
const REDIRECT = "https://claude.ai/cb";
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");

beforeEach(async () => {
  await db.rateLimit.deleteMany();
});

const form = (path: string, fields: Record<string, string>, ip = "203.0.113.1") =>
  new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-real-ip": ip },
    body: new URLSearchParams(fields),
  });

async function codeFor() {
  const user = await makeUser();
  const { client_id } = await registerClient({ redirect_uris: [REDIRECT] });
  const code = await createAuthorizationCode({
    clientId: client_id, userId: user.id, redirectUri: REDIRECT, codeChallenge: CHALLENGE,
    scopes: ["applications:read"], resource: RESOURCE,
  });
  return { client_id, code };
}

test("authorization server metadata advertises PKCE S256, CIMD, DCR and iss", async () => {
  const res = authServerMetadata(new Request(`${ORIGIN}/.well-known/oauth-authorization-server`));
  const meta = await res.json();
  expect(meta).toMatchObject({
    issuer: ORIGIN,
    authorization_endpoint: `${ORIGIN}/oauth/authorize`,
    token_endpoint: `${ORIGIN}/oauth/token`,
    registration_endpoint: `${ORIGIN}/oauth/register`,
    revocation_endpoint: `${ORIGIN}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["applications:read", "applications:write"],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
  });
  expect(res.headers.get("access-control-allow-origin")).toBe("*");
});

test("protected resource metadata names the MCP resource and this issuer, at both paths", async () => {
  for (const path of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/api/mcp"]) {
    const meta = await resourceMetadata(new Request(`${ORIGIN}${path}`)).json();
    expect(meta).toMatchObject({ resource: RESOURCE, authorization_servers: [ORIGIN], scopes_supported: ["applications:read", "applications:write"] });
  }
});

test("token endpoint: code → tokens, then refresh, with no-store", async () => {
  const { client_id, code } = await codeFor();
  const res = await token(form("/oauth/token", {
    grant_type: "authorization_code", code, client_id, redirect_uri: REDIRECT, code_verifier: VERIFIER, resource: RESOURCE,
  }));
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toBe("no-store");
  const tokens = await res.json();
  expect(await verifyAccessToken(tokens.access_token, RESOURCE)).not.toBeNull();
  const refreshed = await (await token(form("/oauth/token", { grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id }))).json();
  expect(refreshed.access_token).toBeTruthy();
});

test("token endpoint errors use OAuth error codes", async () => {
  const { client_id, code } = await codeFor();
  const bad = await token(form("/oauth/token", { grant_type: "authorization_code", code, client_id, redirect_uri: REDIRECT, code_verifier: "x".repeat(43) }));
  expect(bad.status).toBe(400);
  expect((await bad.json()).error).toBe("invalid_grant");
  expect((await (await token(form("/oauth/token", { grant_type: "password", client_id }))).json()).error).toBe("unsupported_grant_type");
  expect((await (await token(form("/oauth/token", { grant_type: "authorization_code" }))).json()).error).toBe("invalid_request");
});

test("token requests are limited per network and client, so spamming a public client_id can't lock others out", async () => {
  const spam = { grant_type: "refresh_token", refresh_token: "x", client_id: "https://claude.ai/oauth/claude-client.json" };
  for (let i = 0; i < 60; i++) await token(form("/oauth/token", spam, "198.51.100.66"));
  expect((await token(form("/oauth/token", spam, "198.51.100.66"))).status).toBe(429);
  const realUser = await token(form("/oauth/token", spam, "203.0.113.200"));
  expect(realUser.status).toBe(400);
  expect((await realUser.json()).error).toBe("invalid_grant");
});

test("an oversized client_id is rejected cleanly", async () => {
  const res = await token(form("/oauth/token", { grant_type: "refresh_token", refresh_token: "x", client_id: "a".repeat(5000) }));
  expect(res.status).toBe(400);
  expect((await res.json()).error).toBe("invalid_request");
});

test("revoke always answers 200 and kills the token", async () => {
  const { client_id, code } = await codeFor();
  const tokens = await (await token(form("/oauth/token", {
    grant_type: "authorization_code", code, client_id, redirect_uri: REDIRECT, code_verifier: VERIFIER,
  }))).json();
  expect((await revoke(form("/oauth/revoke", { token: tokens.access_token }))).status).toBe(200);
  expect(await verifyAccessToken(tokens.access_token, RESOURCE)).toBeNull();
  expect((await revoke(form("/oauth/revoke", { token: "unknown" }))).status).toBe(200);
});
