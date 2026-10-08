import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;

/** An unguessable token: 32 random bytes, base64url. */
export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Tokens are stored only as this hash, so a database leak doesn't leak working tokens. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** PKCE S256 (RFC 7636): BASE64URL(SHA256(verifier)) must equal the challenge sent at authorize time. */
export function verifyPkce(verifier: string, challenge: string): boolean {
  if (!VERIFIER.test(verifier)) return false;
  const expected = Buffer.from(createHash("sha256").update(verifier).digest("base64url"));
  const given = Buffer.from(challenge);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
