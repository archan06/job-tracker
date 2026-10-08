import { beforeEach, expect, test } from "vitest";
import { db } from "@/server/db";
import {
  ToolInputError,
  addApplicationTool,
  addTimelineEntryTool,
  changeStatusTool,
  getApplicationTool,
  pipelineSummaryTool,
  searchApplicationsTool,
  updateApplicationTool,
} from "@/server/mcp/tools";
import { NotFoundError, RateLimitedError } from "@/server/services/errors";
import { MCP_READS_PER_MINUTE } from "@/server/services/rate-limit";
import { makeApplication, makeUser } from "./factories";

beforeEach(async () => {
  await db.rateLimit.deleteMany();
});

test("add_application validates like the website and returns the new record", async () => {
  const u = await makeUser();
  const added = await addApplicationTool(u.id, { company: "Stripe", title: "Engineer", companyDomain: "https://www.stripe.com/jobs", status: "APPLIED" });
  expect(added).toMatchObject({ company: "Stripe", title: "Engineer", companyDomain: "stripe.com", status: "APPLIED" });
  expect(added.dateApplied).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await expect(addApplicationTool(u.id, { company: "", title: "x" })).rejects.toThrow(ToolInputError);
  await expect(addApplicationTool(u.id, { company: "Acme", title: "x", companyDomain: "nope" })).rejects.toThrow("Enter a website like acme.com");
});

test("search_applications filters, sorts and caps results to the user's own", async () => {
  const u = await makeUser();
  const other = await makeUser();
  await makeApplication(u.id, { company: "Acme", status: "APPLIED" });
  await makeApplication(u.id, { company: "Beta", status: "SAVED" });
  await makeApplication(other.id, { company: "Acme Secret", status: "APPLIED" });
  const all = await searchApplicationsTool(u.id, {});
  expect(all.applications.map((a) => a.company).sort()).toEqual(["Acme", "Beta"]);
  const applied = await searchApplicationsTool(u.id, { statuses: ["APPLIED"] });
  expect(applied.applications.map((a) => a.company)).toEqual(["Acme"]);
  expect((await searchApplicationsTool(u.id, { company: "acme" })).applications).toHaveLength(1);
  expect((await searchApplicationsTool(u.id, { limit: 1 })).applications).toHaveLength(1);
  expect(all.total).toBe(2);
});

test("get_application returns details and timeline; another user's id is not found", async () => {
  const u = await makeUser();
  const intruder = await makeUser();
  const a = await makeApplication(u.id, { company: "Acme", notes: "Referral from Sam" });
  const details = await getApplicationTool(u.id, { id: a.id });
  expect(details).toMatchObject({ id: a.id, company: "Acme", notes: "Referral from Sam" });
  expect(details.timeline[0]).toMatchObject({ type: "STATUS_CHANGE", toStatus: "SAVED" });
  await expect(getApplicationTool(intruder.id, { id: a.id })).rejects.toThrow(NotFoundError);
});

test("update_application changes only the given fields, can clear optional ones, and never touches other users", async () => {
  const u = await makeUser();
  const intruder = await makeUser();
  const a = await makeApplication(u.id, { company: "Acme", title: "Engineer", location: "Toronto", notes: "keep me" });
  const updated = await updateApplicationTool(u.id, { id: a.id, title: "Senior Engineer", location: null });
  expect(updated).toMatchObject({ company: "Acme", title: "Senior Engineer", location: null, notes: "keep me", status: "SAVED" });
  await expect(updateApplicationTool(intruder.id, { id: a.id, title: "Hacked" })).rejects.toThrow(NotFoundError);
  expect((await getApplicationTool(u.id, { id: a.id })).title).toBe("Senior Engineer");
  await expect(updateApplicationTool(u.id, { id: a.id, company: "" })).rejects.toThrow(ToolInputError);
});

test("change_status logs the move; another user's id is not found", async () => {
  const u = await makeUser();
  const intruder = await makeUser();
  const a = await makeApplication(u.id);
  const moved = await changeStatusTool(u.id, { id: a.id, status: "INTERVIEW" });
  expect(moved.status).toBe("INTERVIEW");
  const { timeline } = await getApplicationTool(u.id, { id: a.id });
  expect(timeline.some((e) => e.type === "STATUS_CHANGE" && e.fromStatus === "SAVED" && e.toStatus === "INTERVIEW")).toBe(true);
  await expect(changeStatusTool(intruder.id, { id: a.id, status: "REJECTED" })).rejects.toThrow(NotFoundError);
});

test("add_timeline_entry adds an entry dated today by default, and validates notes", async () => {
  const u = await makeUser();
  const a = await makeApplication(u.id);
  const entry = await addTimelineEntryTool(u.id, { id: a.id, type: "INTERVIEW", notes: "Phone screen with Sam" });
  expect(entry).toMatchObject({ type: "INTERVIEW", notes: "Phone screen with Sam" });
  expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect((await addTimelineEntryTool(u.id, { id: a.id, type: "EMAIL", date: "2026-10-01" })).date).toBe("2026-10-01");
  await expect(addTimelineEntryTool(u.id, { id: a.id, type: "NOTE" })).rejects.toThrow("Write a note");
});

test("pipeline_summary counts by status and lists stale applications", async () => {
  const u = await makeUser();
  const stale = await makeApplication(u.id, { company: "Old Co", status: "APPLIED" });
  await makeApplication(u.id, { company: "Fresh Co", status: "APPLIED" });
  await makeApplication(u.id, { company: "Saved Co", status: "SAVED" });
  await db.application.update({ where: { id: stale.id }, data: { updatedAt: new Date(Date.now() - 20 * 24 * 60 * 60_000) } });
  const summary = await pipelineSummaryTool(u.id);
  expect(summary.counts).toMatchObject({ SAVED: 1, APPLIED: 2, INTERVIEW: 0 });
  expect(summary.total).toBe(3);
  expect(summary.stale.map((s) => s.company)).toEqual(["Old Co"]);
  expect(summary.stale[0].daysSinceUpdate).toBeGreaterThanOrEqual(20);
});

test("reads are limited per user per minute", async () => {
  const u = await makeUser();
  for (let i = 0; i < MCP_READS_PER_MINUTE; i++) await searchApplicationsTool(u.id, { limit: 1 });
  await expect(searchApplicationsTool(u.id, { limit: 1 })).rejects.toThrow(RateLimitedError);
});
