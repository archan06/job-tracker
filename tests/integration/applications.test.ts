import { describe, expect, test } from "vitest";
import { parseDateOnly, toDateInputValue } from "@/lib/dates";
import { db } from "@/server/db";
import {
  changeStatus,
  countApplications,
  createApplication,
  deleteApplication,
  getApplication,
  listApplications,
  listBoard,
  updateApplication,
} from "@/server/services/applications";
import { NotFoundError } from "@/server/services/errors";
import { applicationInputSchema } from "@/lib/validation/application";
import { addEvent } from "@/server/services/events";
import { makeApplication, makeUser } from "./factories";

describe("status history", () => {
  test("create logs an initial STATUS_CHANGE event from null", async () => {
    const u = await makeUser();
    const a = await createApplication(u.id, { company: "Acme", title: "Dev", status: "SAVED", source: "OTHER" });
    const events = await db.event.findMany({ where: { applicationId: a.id } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "STATUS_CHANGE", fromStatus: null, toStatus: "SAVED" });
  });

  test("changeStatus writes one event and updates status", async () => {
    const u = await makeUser();
    const a = await makeApplication(u.id);
    await changeStatus(u.id, a.id, "APPLIED");
    const { status, events } = await getApplication(u.id, a.id);
    expect(status).toBe("APPLIED");
    expect(events[0]).toMatchObject({ type: "STATUS_CHANGE", fromStatus: "SAVED", toStatus: "APPLIED" });
  });

  test("changeStatus to the same status is a no-op", async () => {
    const u = await makeUser();
    const a = await makeApplication(u.id);
    await changeStatus(u.id, a.id, "SAVED");
    expect(await db.event.count({ where: { applicationId: a.id } })).toBe(1);
  });

  test("two identical status changes at once log one event", async () => {
    const u = await makeUser();
    const a = await makeApplication(u.id);
    await Promise.all([changeStatus(u.id, a.id, "APPLIED"), changeStatus(u.id, a.id, "APPLIED")]);
    expect(await db.event.count({ where: { applicationId: a.id, toStatus: "APPLIED" } })).toBe(1);
  });

  test("moving to APPLIED fills empty dateApplied but never overwrites it", async () => {
    const u = await makeUser();
    const a = await makeApplication(u.id);
    expect((await changeStatus(u.id, a.id, "APPLIED")).dateApplied).not.toBeNull();
    const b = await makeApplication(u.id, { dateApplied: parseDateOnly("2026-01-02") });
    expect(toDateInputValue((await changeStatus(u.id, b.id, "APPLIED")).dateApplied!)).toBe("2026-01-02");
  });

  test("updateApplication with a new status logs exactly one event", async () => {
    const u = await makeUser();
    const a = await makeApplication(u.id);
    await updateApplication(u.id, a.id, { company: "Acme", title: "Dev", status: "INTERVIEW", source: "OTHER" });
    expect(await db.event.count({ where: { applicationId: a.id, type: "STATUS_CHANGE" } })).toBe(2);
  });

  test("updateApplication with the same status logs no event and saves fields", async () => {
    const u = await makeUser();
    const a = await makeApplication(u.id);
    const updated = await updateApplication(u.id, a.id, {
      company: "Acme",
      title: "Staff Dev",
      status: "SAVED",
      source: "REFERRAL",
    });
    expect(updated).toMatchObject({ company: "Acme", title: "Staff Dev", source: "REFERRAL" });
    expect(await db.event.count({ where: { applicationId: a.id } })).toBe(1);
  });

  test("updateApplication clears optional fields left empty", async () => {
    const u = await makeUser();
    const a = await makeApplication(u.id, { location: "Remote", notes: "Ping recruiter" });
    const updated = await updateApplication(u.id, a.id, { company: "Acme", title: "Dev", status: "SAVED", source: "OTHER" });
    expect(updated.location).toBeNull();
    expect(updated.notes).toBeNull();
  });
});

describe("authorization", () => {
  test("other users' applications are not found for every operation", async () => {
    const owner = await makeUser("owner@example.com");
    const other = await makeUser("other@example.com");
    const a = await makeApplication(owner.id);
    const input = { company: "X", title: "Y", status: "SAVED", source: "OTHER" } as const;
    await expect(getApplication(other.id, a.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateApplication(other.id, a.id, input)).rejects.toBeInstanceOf(NotFoundError);
    await expect(changeStatus(other.id, a.id, "OFFER")).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteApplication(other.id, a.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(addEvent(other.id, a.id, { type: "NOTE", date: new Date(), notes: "x" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(await listApplications(other.id)).toEqual([]);
    expect((await getApplication(owner.id, a.id)).status).toBe("SAVED");
  });

  test("unknown ids are not found", async () => {
    const u = await makeUser();
    await expect(getApplication(u.id, "does-not-exist")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("delete and list", () => {
  test("delete removes events", async () => {
    const u = await makeUser();
    const a = await makeApplication(u.id);
    await deleteApplication(u.id, a.id);
    expect(await db.event.count({ where: { applicationId: a.id } })).toBe(0);
    await expect(getApplication(u.id, a.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  test("listApplications filters", async () => {
    const u = await makeUser();
    await makeApplication(u.id, {
      company: "Acme Corp",
      status: "APPLIED",
      source: "REFERRAL",
      dateApplied: parseDateOnly("2026-09-01"),
    });
    await makeApplication(u.id, { company: "Globex", status: "SAVED", source: "LINKEDIN" });
    expect((await listApplications(u.id, { company: "acme" })).map((a) => a.company)).toEqual(["Acme Corp"]);
    expect(await listApplications(u.id, { statuses: ["SAVED"], sources: ["LINKEDIN"] })).toHaveLength(1);
    expect(
      await listApplications(u.id, { appliedFrom: parseDateOnly("2026-09-01"), appliedTo: parseDateOnly("2026-09-01") }),
    ).toHaveLength(1);
  });

  test("listApplications sorts by updatedAt desc by default and honours sort", async () => {
    const u = await makeUser();
    await makeApplication(u.id, { company: "Bravo" });
    await makeApplication(u.id, { company: "Alpha" });
    expect((await listApplications(u.id)).map((a) => a.company)).toEqual(["Alpha", "Bravo"]);
    expect((await listApplications(u.id, { sort: "company", dir: "asc" })).map((a) => a.company)).toEqual([
      "Alpha",
      "Bravo",
    ]);
  });
});

test("countApplications counts only the user's own", async () => {
  const u = await makeUser();
  const other = await makeUser();
  await makeApplication(u.id);
  await makeApplication(u.id);
  await makeApplication(other.id);
  expect(await countApplications(u.id)).toBe(2);
});

describe("calendar dates for status changes", () => {
  test("changeStatus records the viewer's day for dateApplied and the event", async () => {
    const u = await makeUser();
    const a = await makeApplication(u.id);
    const today = parseDateOnly("2026-10-07");
    const updated = await changeStatus(u.id, a.id, "APPLIED", { today });
    expect(toDateInputValue(updated.dateApplied!)).toBe("2026-10-07");
    const { events } = await getApplication(u.id, a.id);
    expect(events[0].date.toISOString()).toBe("2026-10-07T00:00:00.000Z");
  });

  test("create as Applied with a blank date uses the viewer's day", async () => {
    const u = await makeUser();
    const a = await createApplication(
      u.id,
      { company: "Acme", title: "Dev", status: "APPLIED", source: "OTHER" },
      { today: parseDateOnly("2026-03-03") },
    );
    expect(toDateInputValue(a.dateApplied!)).toBe("2026-03-03");
  });

  test("entries on the same day are newest first", async () => {
    const u = await makeUser();
    const today = parseDateOnly("2026-10-07");
    const a = await createApplication(u.id, { company: "Acme", title: "Dev", status: "SAVED", source: "OTHER" }, { today });
    await addEvent(u.id, a.id, { type: "NOTE", date: today, notes: "Added after creating it" });
    const { events } = await getApplication(u.id, a.id);
    expect(events.map((e) => e.type)).toEqual(["NOTE", "STATUS_CHANGE"]);
  });
});

test("companyDomain is saved normalized, shown in lists and on the board, and cleared by a blank edit", async () => {
  const user = await makeUser();
  const app = await makeApplication(user.id, { companyDomain: "stripe.com" });
  expect(app.companyDomain).toBe("stripe.com");
  expect((await listApplications(user.id))[0].companyDomain).toBe("stripe.com");
  expect((await listBoard(user.id)).columns.SAVED[0].companyDomain).toBe("stripe.com");
  const input = applicationInputSchema.parse({ company: "Stripe", title: "Engineer", companyDomain: "" });
  expect((await updateApplication(user.id, app.id, input)).companyDomain).toBeNull();
});
