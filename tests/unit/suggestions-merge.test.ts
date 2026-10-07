import { expect, test } from "vitest";
import { mergeCompanySuggestions } from "@/server/services/suggestions";

test("recent first, directory deduped by domain, name match fills a missing domain, max 8", () => {
  const out = mergeCompanySuggestions(
    [
      { name: "Stripe", domain: null },
      { name: "Acme", domain: "acme.io" },
    ],
    [
      { name: "stripe", domain: "stripe.com" },
      { name: "Acme Inc", domain: "ACME.io" },
      ...Array.from({ length: 10 }, (_, i) => ({ name: `Co${i}`, domain: `co${i}.com` })),
    ],
  );
  expect(out.slice(0, 2)).toEqual([
    { name: "Stripe", domain: "stripe.com", source: "recent" },
    { name: "Acme", domain: "acme.io", source: "recent" },
  ]);
  expect(out.filter((s) => s.domain === "acme.io")).toHaveLength(1);
  expect(out.filter((s) => s.domain === "stripe.com")).toHaveLength(1);
  expect(out[2]).toEqual({ name: "Co0", domain: "co0.com", source: "directory" });
  expect(out).toHaveLength(8);
});

test("with nothing recent, directory results pass through", () => {
  expect(mergeCompanySuggestions([], [{ name: "Stripe", domain: "stripe.com" }])).toEqual([
    { name: "Stripe", domain: "stripe.com", source: "directory" },
  ]);
});
