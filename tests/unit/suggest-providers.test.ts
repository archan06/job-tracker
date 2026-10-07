import { expect, test } from "vitest";
import { formatCityLabel } from "@/lib/location";
import { geoapifyDirectory } from "@/server/suggest/geoapify";
import { logoDevDirectory } from "@/server/suggest/logo-dev";

function stubFetch(body: unknown, status = 200) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

test("Logo.dev search uses typeahead with the secret key and keeps only valid, normalized domains", async () => {
  const { calls, fetchImpl } = stubFetch({
    data: [
      { name: "Stripe", domain: "STRIPE.com" },
      { name: "Bad", domain: "" },
      { name: "Junk", domain: "not a domain" },
    ],
  });
  const results = await logoDevDirectory("sk_x", fetchImpl).search("stri");
  expect(calls[0].url).toBe("https://api.logo.dev/v2/search?q=stri&limit=8&method=typeahead");
  expect(new Headers(calls[0].init?.headers).get("authorization")).toBe("Bearer sk_x");
  expect(results).toEqual([{ name: "Stripe", domain: "stripe.com" }]);
});

test("Logo.dev search rejects on an error status", async () => {
  const { fetchImpl } = stubFetch({ error: "nope" }, 500);
  await expect(logoDevDirectory("sk_x", fetchImpl).search("stri")).rejects.toThrow();
});

test("Geoapify city search builds the URL, formats labels, drops duplicates and city-less rows", async () => {
  const toronto = { city: "Toronto", state: "Ontario", state_code: "ON", country: "Canada" };
  const { calls, fetchImpl } = stubFetch({ results: [toronto, { ...toronto }, { state: "Ontario", country: "Canada" }] });
  const results = await geoapifyDirectory("k", fetchImpl).searchCities("tor");
  expect(calls[0].url).toBe("https://api.geoapify.com/v1/geocode/autocomplete?text=tor&type=city&format=json&limit=6&apiKey=k");
  expect(results).toEqual([{ label: "Toronto, ON, Canada" }]);
});

test("Geoapify city search rejects on an error status", async () => {
  const { fetchImpl } = stubFetch({}, 401);
  await expect(geoapifyDirectory("k", fetchImpl).searchCities("tor")).rejects.toThrow();
});

test("formatCityLabel prefers the state code and skips missing parts", () => {
  expect(formatCityLabel({ city: "Toronto", state: "Ontario", state_code: "ON", country: "Canada" })).toBe("Toronto, ON, Canada");
  expect(formatCityLabel({ city: "Paris", state: "Île-de-France", country: "France" })).toBe("Paris, Île-de-France, France");
  expect(formatCityLabel({ city: "Singapore", country: "Singapore" })).toBe("Singapore, Singapore");
  expect(formatCityLabel({ state: "Ontario", country: "Canada" })).toBeNull();
});
