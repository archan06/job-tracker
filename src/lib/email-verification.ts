import { createHash, randomBytes } from "node:crypto";

/** How long a verification link works. */
export const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
/** How long an account created by sign-up may stay unverified before it is deleted. */
export const UNVERIFIED_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type Env = Record<string, string | undefined>;

export function hashVerificationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** The token goes in the link; only its hash is stored, so a copy of the database can't verify anyone. */
export function newVerificationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashVerificationToken(token) };
}

/** Where links point. Never the request's Host header, which an attacker can forge to send links to their own site. */
export function appUrl(env: Env = process.env): string {
  if (env.APP_URL) return env.APP_URL.replace(/\/+$/, "");
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

export function verificationLink(token: string, env: Env = process.env): string {
  return `${appUrl(env)}/verify-email?token=${token}`;
}

export function verificationEmail(link: string): { subject: string; text: string } {
  return {
    subject: "Verify your email for Landed",
    text: [
      "Welcome to Landed!",
      "",
      "Confirm this is your email address by opening this link:",
      link,
      "",
      "The link works for 24 hours.",
      "",
      "If you didn't sign up for Landed, you can ignore this email.",
    ].join("\n"),
  };
}
