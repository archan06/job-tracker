import { expect, test } from "vitest";
import { inboundAddress, newInboundToken, tokenFromRecipients } from "@/lib/inbound/address";
import { isAtsDomain, normalizeCompany, senderDomain } from "@/lib/inbound/companies";
import { gmailForwardingConfirmation } from "@/lib/inbound/forwarding";
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

test("Gmail forwarding confirmation: code from the subject or body, only from Google", () => {
  const subject = "(#123456789) Gmail Forwarding Confirmation - Receive Mail from alex@gmail.com";
  expect(gmailForwardingConfirmation("Gmail Team <forwarding-noreply@google.com>", subject, "")).toEqual({ code: "123456789", link: null });
  expect(gmailForwardingConfirmation("forwarding-noreply@google.com", "Gmail Forwarding Confirmation", "Confirmation code: 987654321")).toEqual({ code: "987654321", link: null });
  expect(gmailForwardingConfirmation("attacker@evil.example", subject, "")).toBeNull();
  expect(gmailForwardingConfirmation("forwarding-noreply@google.com", "Something else", "Confirmation code: 1")).toBeNull();
});

const LINK_EMAIL = `alex@gmail.com has requested to automatically forward mail to your email
address u-abc@in.example.

To allow alex@gmail.com to automatically forward mail to your address,
please click the link below to confirm the request:

https://mail-settings.google.com/mail/vf-%5BANGjdJ-8nDRL_bj3%5D-2XOtyTfwME9miA-C99bX7oPSEyI

If you click the link and it appears to be broken, please copy and paste it`;

test("Gmail forwarding confirmation: the newer link-only email gives the confirmation link", () => {
  const subject = "(Gmail Forwarding Confirmation - Receive Mail from alex@gmail.com";
  expect(gmailForwardingConfirmation("forwarding-noreply@google.com", subject, LINK_EMAIL)).toEqual({
    code: null,
    link: "https://mail-settings.google.com/mail/vf-%5BANGjdJ-8nDRL_bj3%5D-2XOtyTfwME9miA-C99bX7oPSEyI",
  });
});

test("Gmail forwarding confirmation: only https links on Google's settings host are kept", () => {
  const subject = "Gmail Forwarding Confirmation";
  const from = "forwarding-noreply@google.com";
  for (const bad of [
    "https://mail-settings.google.com.evil.example/mail/vf-abc",
    "https://evil.example/mail-settings.google.com/mail/vf-abc",
    "http://mail-settings.google.com/mail/vf-abc",
    "https://user@evil.example/mail/vf-abc",
    "https://mail-settings.google.com/other/path",
  ]) {
    expect(gmailForwardingConfirmation(from, subject, `click the link below:\n\n${bad}\n`)).toEqual({ code: null, link: null });
  }
});

test("Gmail forwarding confirmation without a code or link is still recognized", () => {
  expect(gmailForwardingConfirmation("forwarding-noreply@google.com", "Gmail Forwarding Confirmation", "no code here")).toEqual({ code: null, link: null });
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
  for (const free of ["me@gmail.com", "me@outlook.com", "me@yahoo.com", "me@icloud.com", "me@hotmail.com", "me@proton.me", "recruiter@googlemail.com"]) {
    expect(senderDomain(free)).toBeNull();
  }
  expect(isAtsDomain("ashbyhq.com")).toBe(true);
  expect(isAtsDomain("stripe.com")).toBe(false);
});

test("HTML becomes readable text, and snippets are capped", () => {
  const text = htmlToText("<style>p{}</style><p>Hi Alex,</p><p>Thanks for applying&nbsp;to <b>Stripe</b>!</p><script>x()</script>");
  expect(text).toBe("Hi Alex,\nThanks for applying to Stripe!");
  expect(snippet("a".repeat(600), 500)).toHaveLength(500);
  expect(snippet("  short  ", 500)).toBe("short");
});
