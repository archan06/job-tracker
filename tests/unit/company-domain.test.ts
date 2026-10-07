import { expect, test } from "vitest";
import { normalizeDomain } from "@/lib/company-domain";
import { applicationInputSchema } from "@/lib/validation/application";

test.each([
  ["stripe.com", "stripe.com"],
  ["https://www.Stripe.com/jobs?x=1#y", "stripe.com"],
  ["  ACME.io  ", "acme.io"],
  ["http://user:pw@jobs.acme.co.uk:8080/path", "jobs.acme.co.uk"],
  ["www.example.org", "example.org"],
])("normalizes %s", (input, expected) => expect(normalizeDomain(input)).toBe(expected));

test.each(["localhost", "not a site", "javascript:alert(1)", "acme", "-bad.com", "a..com", "acme.c", "", `${"a".repeat(64)}.com`])(
  "rejects %j",
  (input) => expect(normalizeDomain(input)).toBeNull(),
);

test("schema normalizes, treats blank as undefined, and reports the error copy", () => {
  const base = { company: "Acme", title: "Engineer" };
  expect(applicationInputSchema.parse({ ...base, companyDomain: "https://www.acme.io/" }).companyDomain).toBe("acme.io");
  expect(applicationInputSchema.parse({ ...base, companyDomain: "  " }).companyDomain).toBeUndefined();
  const bad = applicationInputSchema.safeParse({ ...base, companyDomain: "nope" });
  expect(bad.success).toBe(false);
  expect(bad.error!.issues[0].message).toBe("Enter a website like acme.com");
});
