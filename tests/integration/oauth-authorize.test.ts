import { expect, test } from "vitest";
import { registerClient } from "@/server/oauth/clients";
import { validateAuthorizeRequest } from "@/server/oauth/authorize";

const ORIGIN = "https://landed.test";
const REDIRECT = "https://claude.ai/cb";
const CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

async function params(overrides: Record<string, string | undefined> = {}) {
  const { client_id } = await registerClient({ client_name: "Claude", redirect_uris: [REDIRECT] });
  const base: Record<string, string | undefined> = {
    response_type: "code", client_id, redirect_uri: REDIRECT, code_challenge: CHALLENGE,
    code_challenge_method: "S256", state: "xyz", scope: "applications:read", resource: `${ORIGIN}/api/mcp`, ...overrides,
  };
  return Object.fromEntries(Object.entries(base).filter(([, v]) => v !== undefined)) as Record<string, string>;
}

test("a valid request resolves the client, scopes and resource", async () => {
  const result = await validateAuthorizeRequest(await params(), ORIGIN);
  expect(result).toMatchObject({
    ok: true,
    request: { redirectUri: REDIRECT, state: "xyz", scopes: ["applications:read"], codeChallenge: CHALLENGE, resource: `${ORIGIN}/api/mcp`, client: { name: "Claude", kind: "DCR" } },
  });
});

test("resource defaults to the MCP endpoint and scope to both", async () => {
  const result = await validateAuthorizeRequest(await params({ resource: undefined, scope: undefined }), ORIGIN);
  expect(result).toMatchObject({ ok: true, request: { resource: `${ORIGIN}/api/mcp`, scopes: ["applications:read", "applications:write"] } });
});

test.each([
  ["unknown client", { client_id: "dcr_nope" }],
  ["missing client", { client_id: undefined }],
  ["unregistered redirect", { redirect_uri: "https://evil.example/cb" }],
  ["redirect prefix trick", { redirect_uri: "https://claude.ai/cb/../../evil" }],
])("never redirects for %s: shows an error page", async (_, overrides) => {
  const result = await validateAuthorizeRequest(await params(overrides), ORIGIN);
  expect(result.ok).toBe(false);
  expect(result.ok === false && result.redirect).toBeUndefined();
});

test.each([
  ["response_type", { response_type: "token" }, "unsupported_response_type"],
  ["missing PKCE", { code_challenge: undefined }, "invalid_request"],
  ["plain PKCE", { code_challenge_method: "plain" }, "invalid_request"],
  ["bad challenge", { code_challenge: "short" }, "invalid_request"],
  ["unknown scope", { scope: "applications:delete" }, "invalid_scope"],
  ["other resource", { resource: "https://other.test/api/mcp" }, "invalid_target"],
])("redirects back with an error for %s", async (_, overrides, error) => {
  const result = await validateAuthorizeRequest(await params(overrides), ORIGIN);
  expect(result.ok).toBe(false);
  const url = result.ok === false ? result.redirect! : null;
  expect(url?.origin + url!.pathname).toBe(REDIRECT);
  expect(url!.searchParams.get("error")).toBe(error);
  expect(url!.searchParams.get("state")).toBe("xyz");
  expect(url!.searchParams.get("iss")).toBe(ORIGIN);
});
