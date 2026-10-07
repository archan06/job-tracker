import { expect, test } from "vitest";
import { HYBRID_PREFIX, applyCityPick, cityQuery } from "@/lib/location";

test("the hybrid prefix is exact", () => expect(HYBRID_PREFIX).toBe("Hybrid · "));

test.each([
  ["tor", "tor"],
  ["Hybrid · tor", "tor"],
  ["Hybrid · ", ""],
  ["Hybrid · t", "t"],
  ["Hybrid ·", "Hybrid ·"],
  ["  Remote ", "Remote"],
])("cityQuery(%j) = %j", (value, query) => expect(cityQuery(value)).toBe(query));

test("applyCityPick keeps the hybrid prefix", () => {
  expect(applyCityPick("Hybrid · tor", "Toronto, ON, Canada")).toBe("Hybrid · Toronto, ON, Canada");
  expect(applyCityPick("tor", "Toronto, ON, Canada")).toBe("Toronto, ON, Canada");
});
