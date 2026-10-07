import { expect, test } from "vitest";
import { parseDateOnly } from "@/lib/dates";
import { parseTableQuery, toSearchParams } from "@/lib/table-query";
import type { ApplicationFilters } from "@/server/services/applications";

test("defaults", () => {
  expect(parseTableQuery({})).toEqual({ sort: "updatedAt", dir: "desc" });
});

test("multi-value and comma-separated statuses, invalid values dropped", () => {
  expect(parseTableQuery({ status: ["APPLIED", "BOGUS"], source: "REFERRAL,LINKEDIN" })).toMatchObject({
    statuses: ["APPLIED"],
    sources: ["REFERRAL", "LINKEDIN"],
  });
});

test("bad sort and bad dates fall back", () => {
  expect(parseTableQuery({ sort: "password", dir: "sideways", from: "nope" })).toEqual({ sort: "updatedAt", dir: "desc" });
});

test("company is trimmed and blank company ignored", () => {
  expect(parseTableQuery({ company: "  acme " }).company).toBe("acme");
  expect(parseTableQuery({ company: "   " }).company).toBeUndefined();
});

test("round trip", () => {
  const f: ApplicationFilters = {
    statuses: ["OFFER"],
    company: "acme",
    appliedFrom: parseDateOnly("2026-09-01"),
    sort: "company",
    dir: "asc",
  };
  expect(parseTableQuery(Object.fromEntries(toSearchParams(f)))).toEqual(f);
});

test("toSearchParams omits defaults", () => {
  expect(toSearchParams({ sort: "updatedAt", dir: "desc" }).toString()).toBe("");
});

test("page number: valid pages kept, anything else means page 1", () => {
  expect(parseTableQuery({ page: "3" }).page).toBe(3);
  expect(parseTableQuery({ page: "1" }).page).toBeUndefined();
  expect(parseTableQuery({ page: "0" }).page).toBeUndefined();
  expect(parseTableQuery({ page: "-2" }).page).toBeUndefined();
  expect(parseTableQuery({ page: "abc" }).page).toBeUndefined();
  expect(toSearchParams({ sort: "updatedAt", dir: "desc", page: 2 }).toString()).toBe("page=2");
});
