import { expect, test } from "vitest";
import { appUrl, hashVerificationToken, newVerificationToken, verificationEmail, verificationLink } from "@/lib/email-verification";

test("a new token is random base64url, and only its SHA-256 hash is kept", () => {
  const a = newVerificationToken();
  const b = newVerificationToken();
  expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(a.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  expect(a.tokenHash).toBe(hashVerificationToken(a.token));
  expect(a.token).not.toBe(b.token);
});

test("the app URL comes from APP_URL, then Vercel's production URL, then localhost", () => {
  expect(appUrl({ APP_URL: "https://landed.example/" })).toBe("https://landed.example");
  expect(appUrl({ VERCEL_PROJECT_PRODUCTION_URL: "x.vercel.app" })).toBe("https://x.vercel.app");
  expect(appUrl({})).toBe("http://localhost:3000");
});

test("the link points at /verify-email on the app URL", () => {
  expect(verificationLink("abc", { APP_URL: "https://l.test" })).toBe("https://l.test/verify-email?token=abc");
});

test("the email carries the link, the expiry and what to do if it wasn't you", () => {
  const email = verificationEmail("https://l.test/verify-email?token=abc");
  expect(email.subject).toBe("Verify your email for Landed");
  expect(email.text).toContain("https://l.test/verify-email?token=abc");
  expect(email.text).toContain("24 hours");
  expect(email.text).toContain("didn't sign up");
});
