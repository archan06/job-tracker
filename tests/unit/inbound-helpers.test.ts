import { expect, test } from "vitest";
import { inboundAddress, newInboundToken, tokenFromRecipients } from "@/lib/inbound/address";
import { isAtsDomain, normalizeCompany, senderDomain } from "@/lib/inbound/companies";
import { gmailForwardingCode } from "@/lib/inbound/forwarding";
import { htmlToText, snippet } from "@/lib/inbound/text";

const DOMAIN = "in.alexrchan.dev";

test("tokens are 10 lowercase alphanumerics and form the address", () => {
  const token = newInboundToken();
  expect(token).toMatch(/^[a-z0-9]{10}$/);
  expect(newInboundToken()).not.toBe(token);
  expect(inboundAddress("k3j9x2abcd", DOMAIN)).toBe("u-k3j9x2abcd@in.alexrchan.dev");
});

test("finds the token among recipients, case-insensitively, only on our domain", () => {
  expect(tokenFromRecipients(["someone@else.com", "U-K3J9X2ABCD@IN.ALEXRCHAN.DEV"], DOMAIN)).toBe("k3j9x2abcd");
  expect(tokenFromRecipients(['"Me" <u-k3j9x2abcd@in.alexrchan.dev>'], DOMAIN)).toBe("k3j9x2abcd");
  expect(tokenFromRecipients(["u-k3j9x2abcd@evil.example"], DOMAIN)).toBeNull();
  expect(tokenFromRecipients(["u-short@in.alexrchan.dev"], DOMAIN)).toBeNull();
  expect(tokenFromRecipients(["u-k3j9x2abcd@sub.in.alexrchan.dev"], DOMAIN)).toBeNull();
  expect(tokenFromRecipients([], DOMAIN)).toBeNull();
});

test("Gmail forwarding confirmation code comes from the subject or body, only from Google", () => {
  const subject = "(#123456789) Gmail Forwarding Confirmation - Receive Mail from alex@gmail.com";
  expect(gmailForwardingCode("Gmail Team <forwarding-noreply@google.com>", subject, "")).toBe("123456789");
  expect(gmailForwardingCode("forwarding-noreply@google.com", "Gmail Forwarding Confirmation", "Confirmation code: 987654321")).toBe("987654321");
  expect(gmailForwardingCode("attacker@evil.example", subject, "")).toBeNull();
  expect(gmailForwardingCode("forwarding-noreply@google.com", "Something else", "Confirmation code: 1")).toBeNull();
});

test("company names normalize away case, punctuation and legal suffixes", () => {
  expect(normalizeCompany("Stripe, Inc.")).toBe("stripe");
  expect(normalizeCompany("  ACME Corp ")).toBe("acme");
  expect(normalizeCompany("Globex Corporation")).toBe("globex");
  expect(normalizeCompany("Initech LLC")).toBe("initech");
  expect(normalizeCompany("Hooli GmbH")).toBe("hooli");
  expect(normalizeCompany("Co-op Bank")).toBe("co op bank");
  expect(normalizeCompany("")).toBe("");
});

test("sender domain is the registrable domain, and job boards don't count", () => {
  expect(senderDomain("Stripe Recruiting <jobs@mail.stripe.com>")).toBe("stripe.com");
  expect(senderDomain("people@acme.co.uk")).toBe("acme.co.uk");
  expect(senderDomain("no-reply@greenhouse.io")).toBeNull();
  expect(senderDomain("notifications@hire.lever.co")).toBeNull();
  expect(senderDomain("x@myworkday.com")).toBeNull();
  expect(senderDomain("not an email")).toBeNull();
  expect(isAtsDomain("ashbyhq.com")).toBe(true);
  expect(isAtsDomain("stripe.com")).toBe(false);
});

test("HTML becomes readable text, and snippets are capped", () => {
  const text = htmlToText("<style>p{}</style><p>Hi Alex,</p><p>Thanks for applying&nbsp;to <b>Stripe</b>!</p><script>x()</script>");
  expect(text).toBe("Hi Alex,\nThanks for applying to Stripe!");
  expect(snippet("a".repeat(600), 500)).toHaveLength(500);
  expect(snippet("  short  ", 500)).toBe("short");
});
