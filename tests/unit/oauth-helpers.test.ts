import { expect, test } from "vitest";
import { hashToken, randomToken, verifyPkce } from "@/lib/oauth/crypto";
import { SCOPES, isAllowedRedirectUri, parseScopes } from "@/lib/oauth/params";

test("PKCE S256 matches the RFC 7636 example and rejects others", () => {
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
  expect(verifyPkce(verifier, challenge)).toBe(true);
  expect(verifyPkce(verifier.replace("d", "e"), challenge)).toBe(false);
  expect(verifyPkce("too-short", "x")).toBe(false);
  expect(verifyPkce(`${verifier}!`, challenge)).toBe(false);
});

test("tokens are 32 random bytes in base64url and hash to stable sha256 hex", () => {
  const a = randomToken();
  expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(randomToken()).not.toBe(a);
  expect(hashToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("scopes: empty means both, unknown means invalid, duplicates collapse", () => {
  expect(SCOPES).toEqual(["applications:read", "applications:write"]);
  expect(parseScopes(null)).toEqual([...SCOPES]);
  expect(parseScopes("  ")).toEqual([...SCOPES]);
  expect(parseScopes("applications:read applications:read")).toEqual(["applications:read"]);
  expect(parseScopes("applications:write applications:read")).toEqual(["applications:read", "applications:write"]);
  expect(parseScopes("applications:delete")).toBeNull();
});

test.each([
  ["https://claude.ai/api/mcp/auth_callback", true],
  ["https://chatgpt.com/connector_platform_oauth_redirect", true],
  ["http://localhost:6274/oauth/callback", true],
  ["http://127.0.0.1:33418/callback", true],
  ["http://example.com/cb", false],
  ["https://example.com/cb#frag", false],
  ["javascript:alert(1)", false],
  ["not a url", false],
  ["https://user:pw@example.com/cb", false],
])("isAllowedRedirectUri(%s) = %s", (uri, ok) => expect(isAllowedRedirectUri(uri)).toBe(ok));
