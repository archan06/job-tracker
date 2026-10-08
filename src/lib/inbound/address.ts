import { randomInt } from "node:crypto";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const TOKEN_LENGTH = 10;

/** The secret part of a user's private forwarding address. */
export function newInboundToken(): string {
  return Array.from({ length: TOKEN_LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}

export function inboundAddress(token: string, domain: string): string {
  return `u-${token}@${domain}`;
}

/** The user token from whichever recipient is one of our addresses (e.g. `"Me" <u-abc...@domain>`), or null. */
export function tokenFromRecipients(recipients: string[], domain: string): string | null {
  const pattern = new RegExp(`(?:^|[<\\s"])u-([a-z0-9]{${TOKEN_LENGTH}})@${domain.toLowerCase().replace(/\./g, "\\.")}(?:$|[>\\s"])`);
  for (const recipient of recipients) {
    const match = recipient.toLowerCase().trim().match(pattern);
    if (match) return match[1];
  }
  return null;
}
