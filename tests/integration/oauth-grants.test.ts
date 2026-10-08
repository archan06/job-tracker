import { createHash } from "node:crypto";
import { expect, test, vi } from "vitest";
import { db } from "@/server/db";
import { registerClient } from "@/server/oauth/clients";
import {
  createAuthorizationCode,
  disconnectGrant,
  exchangeCode,
  listGrants,
  refreshGrant,
  revokeToken,
  verifyAccessToken,
} from "@/server/oauth/grants";
import { makeUser } from "./factories";

const RESOURCE = "https://landed.test/api/mcp";
const REDIRECT = "https://claude.ai/cb";
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");
const t0 = new Date("2026-10-07T12:00:00Z");
const at = (ms: number) => new Date(t0.getTime() + ms);
const MIN = 60_000;

async function setup(scopes = ["applications:read", "applications:write"]) {
  const user = await makeUser();
  const { client_id } = await registerClient({ client_name: "Claude", redirect_uris: [REDIRECT] }, t0);
  const code = await createAuthorizationCode(
    { clientId: client_id, userId: user.id, redirectUri: REDIRECT, codeChallenge: CHALLENGE, scopes, resource: RESOURCE },
    t0,
  );
  return { user, clientId: client_id, code };
}

const exchange = (o: { code: string; clientId: string }, extra: Partial<Parameters<typeof exchangeCode>[0]> = {}, now = at(10_000)) =>
  exchangeCode({ code: o.code, clientId: o.clientId, redirectUri: REDIRECT, codeVerifier: VERIFIER, resource: RESOURCE, ...extra }, now);

test("a code exchanges once for tokens that verify for the right resource", async () => {
  const s = await setup();
  const tokens = await exchange(s);
  expect(tokens).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "applications:read applications:write" });
  expect(tokens.access_token).not.toBe(tokens.refresh_token);
  expect(await verifyAccessToken(tokens.access_token, RESOURCE, at(MIN))).toMatchObject({
    userId: s.user.id,
    clientId: s.clientId,
    scopes: ["applications:read", "applications:write"],
  });
  expect(await verifyAccessToken(tokens.access_token, "https://other.test/api/mcp", at(MIN))).toBeNull();
  expect(await verifyAccessToken(tokens.refresh_token, RESOURCE, at(MIN))).toBeNull();
  expect(await verifyAccessToken(tokens.access_token, RESOURCE, at(61 * MIN))).toBeNull();
});

test("access tokens of unverified users are rejected", async () => {
  const s = await setup();
  const tokens = await exchange(s);
  await db.user.update({ where: { id: s.user.id }, data: { emailVerified: null } });
  expect(await verifyAccessToken(tokens.access_token, RESOURCE, at(MIN))).toBeNull();
});

test("tokens are stored only as hashes", async () => {
  const s = await setup();
  const tokens = await exchange(s);
  const grant = await db.oAuthGrant.findFirstOrThrow({ where: { userId: s.user.id } });
  expect(JSON.stringify(grant)).not.toContain(tokens.access_token);
  expect(JSON.stringify(grant)).not.toContain(tokens.refresh_token);
});

test("a reused code fails and revokes the tokens it issued", async () => {
  const s = await setup();
  const tokens = await exchange(s);
  await expect(exchange(s)).rejects.toMatchObject({ code: "invalid_grant" });
  expect(await verifyAccessToken(tokens.access_token, RESOURCE, at(MIN))).toBeNull();
});

test.each([
  ["expired", {}, at(61_000)],
  ["wrong verifier", { codeVerifier: VERIFIER.replace("d", "e") }, undefined],
  ["wrong redirect", { redirectUri: "https://claude.ai/other" }, undefined],
  ["unknown code", { code: "nope" }, undefined],
] as const)("exchange fails with invalid_grant: %s", async (_, extra, now) => {
  const s = await setup();
  await expect(exchange(s, extra, now ?? at(10_000))).rejects.toMatchObject({ code: "invalid_grant" });
});

test("a code issued to client A can't be redeemed by client B", async () => {
  const s = await setup();
  const other = await registerClient({ redirect_uris: [REDIRECT] }, t0);
  await expect(exchange({ code: s.code, clientId: other.client_id })).rejects.toMatchObject({ code: "invalid_grant" });
});

test("a different resource at exchange is invalid_target", async () => {
  const s = await setup();
  await expect(exchange(s, { resource: "https://other.test/api/mcp" })).rejects.toMatchObject({ code: "invalid_target" });
});

test("refresh rotates both tokens; the old refresh token can't be used again", async () => {
  const s = await setup();
  const first = await exchange(s);
  const second = await refreshGrant({ refreshToken: first.refresh_token, clientId: s.clientId, resource: RESOURCE }, at(MIN));
  expect(second.refresh_token).not.toBe(first.refresh_token);
  expect(await verifyAccessToken(first.access_token, RESOURCE, at(2 * MIN))).toBeNull();
  expect(await verifyAccessToken(second.access_token, RESOURCE, at(2 * MIN))).not.toBeNull();
});

test("reusing a rotated-out refresh token revokes the whole connection", async () => {
  const s = await setup();
  const first = await exchange(s);
  const second = await refreshGrant({ refreshToken: first.refresh_token, clientId: s.clientId }, at(MIN));
  await expect(refreshGrant({ refreshToken: first.refresh_token, clientId: s.clientId }, at(2 * MIN))).rejects.toMatchObject({ code: "invalid_grant" });
  expect(await verifyAccessToken(second.access_token, RESOURCE, at(3 * MIN))).toBeNull();
  await expect(refreshGrant({ refreshToken: second.refresh_token, clientId: s.clientId }, at(3 * MIN))).rejects.toMatchObject({ code: "invalid_grant" });
});

test("refresh fails for another client, an access token, or after 30 days", async () => {
  const s = await setup();
  const tokens = await exchange(s);
  const other = await registerClient({ redirect_uris: [REDIRECT] }, t0);
  await expect(refreshGrant({ refreshToken: tokens.refresh_token, clientId: other.client_id }, at(MIN))).rejects.toMatchObject({ code: "invalid_grant" });
  await expect(refreshGrant({ refreshToken: tokens.access_token, clientId: s.clientId }, at(MIN))).rejects.toMatchObject({ code: "invalid_grant" });
  await expect(refreshGrant({ refreshToken: tokens.refresh_token, clientId: s.clientId }, at(31 * 24 * 60 * MIN))).rejects.toMatchObject({ code: "invalid_grant" });
});

test("revoking either token ends the connection", async () => {
  const s = await setup();
  const tokens = await exchange(s);
  await revokeToken(tokens.refresh_token);
  expect(await verifyAccessToken(tokens.access_token, RESOURCE, at(MIN))).toBeNull();
  await expect(revokeToken("garbage")).resolves.toBeUndefined();
});

test("a second install of the same app gets its own connection; the first keeps working", async () => {
  const s = await setup();
  const first = await exchange(s);
  const code2 = await createAuthorizationCode(
    { clientId: s.clientId, userId: s.user.id, redirectUri: REDIRECT, codeChallenge: CHALLENGE, scopes: ["applications:read"], resource: RESOURCE },
    at(MIN),
  );
  const second = await exchange({ code: code2, clientId: s.clientId }, {}, at(MIN + 5000));
  expect(second.scope).toBe("applications:read");
  expect(await verifyAccessToken(first.access_token, RESOURCE, at(2 * MIN))).not.toBeNull();
  expect(await verifyAccessToken(second.access_token, RESOURCE, at(2 * MIN))).not.toBeNull();
  await expect(refreshGrant({ refreshToken: first.refresh_token, clientId: s.clientId }, at(3 * MIN))).resolves.toBeTruthy();
  expect(await listGrants(s.user.id)).toHaveLength(2);
});

test("a retried or concurrent refresh within a minute fails without disconnecting", async () => {
  const s = await setup();
  const first = await exchange(s);
  const second = await refreshGrant({ refreshToken: first.refresh_token, clientId: s.clientId }, at(MIN));
  await expect(refreshGrant({ refreshToken: first.refresh_token, clientId: s.clientId }, at(MIN + 20_000))).rejects.toMatchObject({ code: "invalid_grant" });
  expect(await verifyAccessToken(second.access_token, RESOURCE, at(2 * MIN))).not.toBeNull();
});

test("parallel refreshes with the same token: one wins, the connection survives", async () => {
  const s = await setup();
  const first = await exchange(s);
  const results = await Promise.allSettled(
    [0, 1, 2].map(() => refreshGrant({ refreshToken: first.refresh_token, clientId: s.clientId }, at(MIN))),
  );
  const won = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<{ access_token: string }>[];
  expect(won).toHaveLength(1);
  expect(await verifyAccessToken(won[0].value.access_token, RESOURCE, at(2 * MIN))).not.toBeNull();
});

test("used and expired codes are cleaned up as new ones are issued", async () => {
  const s = await setup();
  await exchange(s);
  await createAuthorizationCode(
    { clientId: s.clientId, userId: s.user.id, redirectUri: REDIRECT, codeChallenge: CHALLENGE, scopes: ["applications:read"], resource: RESOURCE },
    at(2 * 60 * MIN),
  );
  expect(await db.oAuthCode.count({ where: { userId: s.user.id } })).toBe(1);
});

test("listGrants shows active connections; disconnect only works on your own", async () => {
  const s = await setup();
  const tokens = await exchange(s);
  const [grant] = await listGrants(s.user.id);
  expect(grant).toMatchObject({ clientName: "Claude", scopes: ["applications:read", "applications:write"] });
  const intruder = await makeUser();
  await disconnectGrant(intruder.id, grant.id);
  expect(await verifyAccessToken(tokens.access_token, RESOURCE, at(MIN))).not.toBeNull();
  await disconnectGrant(s.user.id, grant.id);
  expect(await verifyAccessToken(tokens.access_token, RESOURCE, at(MIN))).toBeNull();
  expect(await listGrants(s.user.id)).toEqual([]);
});

test("verifying records when the connection was last used", async () => {
  const s = await setup();
  const tokens = await exchange(s);
  await verifyAccessToken(tokens.access_token, RESOURCE, at(5 * MIN));
  const [grant] = await listGrants(s.user.id);
  expect(grant.lastUsedAt).toEqual(at(5 * MIN));
  vi.restoreAllMocks();
});
