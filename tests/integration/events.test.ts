import { expect, test } from "vitest";
import { parseDateOnly } from "@/lib/dates";
import { getApplication } from "@/server/services/applications";
import { addEvent } from "@/server/services/events";
import { makeApplication, makeUser } from "./factories";

test("addEvent stores a user event with no status fields", async () => {
  const u = await makeUser();
  const a = await makeApplication(u.id);
  const e = await addEvent(u.id, a.id, { type: "INTERVIEW", date: parseDateOnly("2026-10-10"), notes: "Onsite" });
  expect(e).toMatchObject({ type: "INTERVIEW", fromStatus: null, toStatus: null, notes: "Onsite" });
});

test("timeline is newest first", async () => {
  const u = await makeUser();
  const a = await makeApplication(u.id);
  await addEvent(u.id, a.id, { type: "NOTE", date: parseDateOnly("2030-01-01"), notes: "Later" });
  const { events } = await getApplication(u.id, a.id);
  expect(events[0].notes).toBe("Later");
  expect(events.at(-1)?.type).toBe("STATUS_CHANGE");
});
