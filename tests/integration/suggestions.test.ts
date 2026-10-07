import { expect, test, vi } from "vitest";
import { db } from "@/server/db";
import { PROVIDER_TIMEOUT_MS, suggestCompanies, suggestLocations } from "@/server/services/suggestions";
import type { CompanyDirectory, PlaceDirectory } from "@/server/suggest/types";
import { makeApplication, makeUser } from "./factories";

const emptyDir: CompanyDirectory = { search: async () => [] };

test("recent companies come only from the current user", async () => {
  const a = await makeUser();
  const b = await makeUser();
  await makeApplication(a.id, { company: "Acme Secret", companyDomain: "acme.io" });
  await makeApplication(b.id, { company: "Acme Rockets" });
  await makeApplication(b.id, { company: "Beta" });
  expect(await suggestCompanies(b.id, "acme", emptyDir)).toEqual([{ name: "Acme Rockets", domain: null, source: "recent" }]);
});

test("one row per company name, keeping its latest saved website", async () => {
  const u = await makeUser();
  const older = await makeApplication(u.id, { company: "Globex", companyDomain: "globex.com" });
  await db.application.update({ where: { id: older.id }, data: { updatedAt: new Date("2020-01-01") } });
  await makeApplication(u.id, { company: "globex" });
  expect(await suggestCompanies(u.id, "globex", emptyDir)).toEqual([{ name: "globex", domain: "globex.com", source: "recent" }]);
});

test("at most 5 recent companies, newest first", async () => {
  const u = await makeUser();
  for (let i = 0; i < 7; i++) {
    const app = await makeApplication(u.id, { company: `Initech ${i}` });
    await db.application.update({ where: { id: app.id }, data: { updatedAt: new Date(Date.UTC(2026, 0, 1 + i)) } });
  }
  const names = (await suggestCompanies(u.id, "initech", emptyDir)).map((s) => s.name);
  expect(names).toEqual(["Initech 6", "Initech 5", "Initech 4", "Initech 3", "Initech 2"]);
});

test("search text with SQL wildcards doesn't match everything", async () => {
  const u = await makeUser();
  await makeApplication(u.id, { company: "Acme" });
  expect(await suggestCompanies(u.id, "%%", emptyDir)).toEqual([]);
  expect(await suggestCompanies(u.id, "__", emptyDir)).toEqual([]);
  await makeApplication(u.id, { company: "100% Juice_Co" });
  expect((await suggestCompanies(u.id, "0% juice_", emptyDir)).map((s) => s.name)).toEqual(["100% Juice_Co"]);
});

test("a failing company directory still returns recent companies", async () => {
  const u = await makeUser();
  await makeApplication(u.id, { company: "Acme" });
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const failing: CompanyDirectory = { search: async () => Promise.reject(new Error("down")) };
  expect(await suggestCompanies(u.id, "acme", failing)).toEqual([{ name: "Acme", domain: null, source: "recent" }]);
  warn.mockRestore();
});

test("a hanging company directory times out and still returns recent companies", async () => {
  const u = await makeUser();
  await makeApplication(u.id, { company: "Acme" });
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const hanging: CompanyDirectory = { search: () => new Promise(() => {}) };
  const started = Date.now();
  expect(await suggestCompanies(u.id, "acme", hanging)).toHaveLength(1);
  expect(Date.now() - started).toBeLessThan(PROVIDER_TIMEOUT_MS + 1000);
  warn.mockRestore();
});

test("a failing place directory returns no cities", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const failing: PlaceDirectory = { searchCities: async () => Promise.reject(new Error("down")) };
  expect(await suggestLocations("tor", failing)).toEqual([]);
  warn.mockRestore();
});

test("cities are deduped and capped at 6", async () => {
  const dir: PlaceDirectory = {
    searchCities: async () => [{ label: "A" }, { label: "A" }, ...["B", "C", "D", "E", "F", "G"].map((label) => ({ label }))],
  };
  expect((await suggestLocations("x", dir)).map((s) => s.label)).toEqual(["A", "B", "C", "D", "E", "F"]);
});
