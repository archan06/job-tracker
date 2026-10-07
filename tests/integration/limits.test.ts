import { expect, test } from "vitest";
import { db } from "@/server/db";
import {
  MAX_APPLICATIONS_PER_USER,
  countApplications,
  createApplication,
  listApplications,
  listBoard,
} from "@/server/services/applications";
import { LimitReachedError } from "@/server/services/errors";
import { makeApplication, makeUser } from "./factories";

test("an account can't go past the application cap", async () => {
  const u = await makeUser();
  await db.application.createMany({
    data: Array.from({ length: MAX_APPLICATIONS_PER_USER }, (_, i) => ({ userId: u.id, company: `C${i}`, title: "T" })),
  });
  await expect(
    createApplication(u.id, { company: "One more", title: "Dev", status: "SAVED", source: "OTHER" }),
  ).rejects.toBeInstanceOf(LimitReachedError);
});

test("listApplications pages through results and leaves out long text", async () => {
  const u = await makeUser();
  for (const company of ["A", "B", "C", "D", "E"]) await makeApplication(u.id, { company, description: "long text" });
  const page2 = await listApplications(u.id, { sort: "company", dir: "asc" }, { page: 2, pageSize: 2 });
  expect(page2.map((a) => a.company)).toEqual(["C", "D"]);
  expect(page2[0]).not.toHaveProperty("description");
});

test("countApplications applies filters", async () => {
  const u = await makeUser();
  await makeApplication(u.id, { status: "SAVED" });
  await makeApplication(u.id, { status: "OFFER" });
  expect(await countApplications(u.id, { statuses: ["OFFER"] })).toBe(1);
  expect(await countApplications(u.id)).toBe(2);
});

test("listBoard returns the newest cards per column and true totals", async () => {
  const u = await makeUser();
  for (const company of ["Old", "Middle", "New"]) await makeApplication(u.id, { company, status: "SAVED" });
  await makeApplication(u.id, { company: "Won", status: "OFFER" });
  const board = await listBoard(u.id, 2);
  expect(board.columns.SAVED.map((c) => c.company)).toEqual(["New", "Middle"]);
  expect(board.totals.SAVED).toBe(3);
  expect(board.totals.OFFER).toBe(1);
  expect(board.columns.REJECTED).toEqual([]);
  expect(board.totals.REJECTED).toBe(0);
});
