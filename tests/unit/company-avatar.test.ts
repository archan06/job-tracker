import { afterEach, expect, test, vi } from "vitest";
import { avatarColor, initials } from "@/lib/company-avatar";
import { logoUrl } from "@/lib/logo";

afterEach(() => vi.unstubAllEnvs());

test.each([
  ["Acme Corp", "AC"],
  ["stripe", "S"],
  ["  open   ai labs ", "OA"],
  ["Ünïcode Co", "ÜC"],
  ["東京 Tech", "東T"],
  ["🚀", "?"],
  ["", "?"],
  ["(—)", "?"],
])("initials(%j) = %s", (name, expected) => expect(initials(name)).toBe(expected));

test("avatarColor is stable, case-insensitive and in 1..8", () => {
  expect(avatarColor("Acme")).toBe(avatarColor("acme"));
  expect(avatarColor(" Acme ")).toBe(avatarColor("acme"));
  for (const name of ["a", "Stripe", "東京", "🚀", ""]) {
    expect(avatarColor(name)).toBeGreaterThanOrEqual(1);
    expect(avatarColor(name)).toBeLessThanOrEqual(8);
  }
  // Not everything lands on the same color.
  expect(new Set(["Acme", "Stripe", "Globex", "Initech", "Umbrella", "Hooli"].map(avatarColor)).size).toBeGreaterThan(2);
});

test("logoUrl builds the CDN URL, or null without a key", () => {
  vi.stubEnv("NEXT_PUBLIC_LOGO_DEV_PUBLISHABLE_KEY", "pk_test");
  expect(logoUrl("stripe.com", 20)).toBe(
    "https://img.logo.dev/stripe.com?token=pk_test&size=20&retina=true&format=webp&fallback=404",
  );
  vi.stubEnv("NEXT_PUBLIC_LOGO_DEV_PUBLISHABLE_KEY", "");
  expect(logoUrl("stripe.com", 20)).toBeNull();
});
