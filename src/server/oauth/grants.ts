import { hashToken, randomToken, verifyPkce } from "@/lib/oauth/crypto";
import { db } from "@/server/db";
import { OAuthError } from "./errors";

export const CODE_TTL_MS = 60_000;
export const ACCESS_TTL_MS = 60 * 60_000;
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60_000;
/** How many rotated-out refresh tokens to remember for reuse detection. */
const RETIRED_KEPT = 20;

export type TokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
};

type CodeInput = {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: string[];
  resource: string;
};

/** A one-time authorization code for the consent the user just gave. Returns the raw code; only its hash is stored. */
export async function createAuthorizationCode(input: CodeInput, now = new Date()): Promise<string> {
  const code = randomToken();
  await db.oAuthCode.create({
    data: { ...input, codeHash: hashToken(code), expiresAt: new Date(now.getTime() + CODE_TTL_MS) },
  });
  return code;
}

function issueTokens(now: Date) {
  const accessToken = randomToken();
  const refreshToken = randomToken();
  return {
    accessToken,
    refreshToken,
    data: {
      accessTokenHash: hashToken(accessToken),
      accessExpiresAt: new Date(now.getTime() + ACCESS_TTL_MS),
      refreshTokenHash: hashToken(refreshToken),
      refreshExpiresAt: new Date(now.getTime() + REFRESH_TTL_MS),
    },
  };
}

const tokenResponse = (accessToken: string, refreshToken: string, scopes: string[]): TokenResponse => ({
  access_token: accessToken,
  token_type: "Bearer",
  expires_in: ACCESS_TTL_MS / 1000,
  refresh_token: refreshToken,
  scope: scopes.join(" "),
});

const REVOKED = (now: Date) => ({ revokedAt: now, accessTokenHash: null, refreshTokenHash: null });

const invalidGrant = (description: string) => new OAuthError("invalid_grant", description);

/** authorization_code grant: verifies the code, its client, redirect URI, PKCE and resource, then issues tokens. */
export async function exchangeCode(
  input: { code: string; clientId: string; redirectUri: string; codeVerifier: string; resource?: string },
  now = new Date(),
): Promise<TokenResponse> {
  const codeHash = hashToken(input.code);
  const code = await db.oAuthCode.findUnique({ where: { codeHash } });
  if (!code) throw invalidGrant("Unknown authorization code");
  if (code.usedAt) {
    // A replayed code may have been intercepted: revoke what it issued (RFC 6749 §4.1.2).
    await db.oAuthGrant.updateMany({ where: { userId: code.userId, clientId: code.clientId }, data: REVOKED(now) });
    throw invalidGrant("Authorization code already used");
  }
  if (code.expiresAt <= now) throw invalidGrant("Authorization code expired");
  if (code.clientId !== input.clientId) throw invalidGrant("Authorization code was issued to another client");
  if (code.redirectUri !== input.redirectUri) throw invalidGrant("redirect_uri does not match");
  if (!verifyPkce(input.codeVerifier, code.codeChallenge)) throw invalidGrant("PKCE verification failed");
  if (input.resource && input.resource !== code.resource) throw new OAuthError("invalid_target", "resource does not match");

  // Conditional update: of two concurrent redemptions, only one wins.
  const { count } = await db.oAuthCode.updateMany({ where: { codeHash, usedAt: null }, data: { usedAt: now } });
  if (count !== 1) throw invalidGrant("Authorization code already used");

  const { accessToken, refreshToken, data } = issueTokens(now);
  const fields = { ...data, scopes: code.scopes, resource: code.resource, retiredRefreshHashes: [], revokedAt: null };
  await db.oAuthGrant.upsert({
    where: { userId_clientId: { userId: code.userId, clientId: code.clientId } },
    create: { userId: code.userId, clientId: code.clientId, createdAt: now, ...fields },
    update: fields,
  });
  return tokenResponse(accessToken, refreshToken, code.scopes);
}

/** refresh_token grant with rotation. Presenting a refresh token that was already rotated out revokes the connection. */
export async function refreshGrant(
  input: { refreshToken: string; clientId: string; resource?: string },
  now = new Date(),
): Promise<TokenResponse> {
  const oldHash = hashToken(input.refreshToken);
  const grant = await db.oAuthGrant.findUnique({ where: { refreshTokenHash: oldHash } });
  if (!grant) {
    const leaked = await db.oAuthGrant.findFirst({ where: { retiredRefreshHashes: { has: oldHash } } });
    if (leaked) await db.oAuthGrant.update({ where: { id: leaked.id }, data: REVOKED(now) });
    throw invalidGrant("Unknown or already-used refresh token");
  }
  if (grant.revokedAt || !grant.refreshExpiresAt || grant.refreshExpiresAt <= now) throw invalidGrant("Refresh token expired or revoked");
  if (grant.clientId !== input.clientId) throw invalidGrant("Refresh token was issued to another client");
  if (input.resource && input.resource !== grant.resource) throw new OAuthError("invalid_target", "resource does not match");

  const { accessToken, refreshToken, data } = issueTokens(now);
  const { count } = await db.oAuthGrant.updateMany({
    where: { id: grant.id, refreshTokenHash: oldHash },
    data: { ...data, retiredRefreshHashes: [oldHash, ...grant.retiredRefreshHashes].slice(0, RETIRED_KEPT) },
  });
  if (count !== 1) throw invalidGrant("Refresh token already used");
  return tokenResponse(accessToken, refreshToken, grant.scopes);
}

/** RFC 7009: revokes the connection owning this access or refresh token. Unknown tokens are ignored. */
export async function revokeToken(token: string, now = new Date()): Promise<void> {
  const hash = hashToken(token);
  await db.oAuthGrant.updateMany({
    where: { OR: [{ accessTokenHash: hash }, { refreshTokenHash: hash }] },
    data: REVOKED(now),
  });
}

export type VerifiedToken = { userId: string; clientId: string; scopes: string[]; expiresAt: Date };

/** The user and scopes behind an access token, or null if it's unknown, expired, revoked or for another resource. */
export async function verifyAccessToken(token: string, resource: string, now = new Date()): Promise<VerifiedToken | null> {
  const grant = await db.oAuthGrant.findUnique({ where: { accessTokenHash: hashToken(token) } });
  if (!grant || grant.revokedAt || !grant.accessExpiresAt || grant.accessExpiresAt <= now) return null;
  if (grant.resource !== resource) return null;
  await db.oAuthGrant.update({ where: { id: grant.id }, data: { lastUsedAt: now } });
  return { userId: grant.userId, clientId: grant.clientId, scopes: grant.scopes, expiresAt: grant.accessExpiresAt };
}

export type GrantSummary = { id: string; clientName: string; scopes: string[]; createdAt: Date; lastUsedAt: Date | null };

/** The user's active connections, newest first. */
export async function listGrants(userId: string): Promise<GrantSummary[]> {
  const grants = await db.oAuthGrant.findMany({
    where: { userId, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, scopes: true, createdAt: true, lastUsedAt: true, client: { select: { name: true } } },
  });
  return grants.map(({ client, ...g }) => ({ ...g, clientName: client.name }));
}

/** Disconnects one of the user's own connections. Other users' ids are silently ignored. */
export async function disconnectGrant(userId: string, grantId: string, now = new Date()): Promise<void> {
  await db.oAuthGrant.updateMany({ where: { id: grantId, userId }, data: REVOKED(now) });
}
