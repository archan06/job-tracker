import { expect, test } from "vitest";
import { groupByStatus, moveCard, type BoardCard } from "@/lib/board";
import { STATUSES, type ApplicationStatus } from "@/lib/status";

const c = (id: string, status: ApplicationStatus, t: number): BoardCard => ({
  id,
  company: "A",
  companyDomain: null,
  title: "T",
  location: null,
  dateApplied: null,
  status,
  updatedAt: new Date(t),
});

test("groups into all seven columns, newest first", () => {
  const g = groupByStatus([c("1", "SAVED", 1), c("2", "SAVED", 2), c("3", "OFFER", 1)]);
  expect(Object.keys(g)).toEqual([...STATUSES]);
  expect(g.SAVED.map((x) => x.id)).toEqual(["2", "1"]);
  expect(g.REJECTED).toEqual([]);
});

test("moveCard moves to the top of the target column with new status", () => {
  const g = moveCard(groupByStatus([c("1", "SAVED", 1), c("2", "APPLIED", 5)]), "1", "APPLIED", new Date(9));
  expect(g.SAVED).toEqual([]);
  expect(g.APPLIED.map((x) => x.id)).toEqual(["1", "2"]);
  expect(g.APPLIED[0].status).toBe("APPLIED");
  expect(g.APPLIED[0].updatedAt).toEqual(new Date(9));
});

test("moveCard to same column or unknown id returns the same object", () => {
  const g = groupByStatus([c("1", "SAVED", 1)]);
  expect(moveCard(g, "1", "SAVED", new Date())).toBe(g);
  expect(moveCard(g, "nope", "OFFER", new Date())).toBe(g);
});

test("moveCard does not mutate its input", () => {
  const g = groupByStatus([c("1", "SAVED", 1)]);
  moveCard(g, "1", "OFFER", new Date(5));
  expect(g.SAVED.map((x) => x.id)).toEqual(["1"]);
  expect(g.SAVED[0].status).toBe("SAVED");
});

import { columnTotal } from "@/lib/board";

test("column totals follow optimistic moves", () => {
  const server = groupByStatus([c("1", "SAVED", 1), c("2", "SAVED", 2)]);
  const moved = moveCard(server, "1", "OFFER", new Date(3));
  // 120 saved in total, only 2 loaded; one moved to Offer (which had 4).
  expect(columnTotal("SAVED", { ...zeroTotals(), SAVED: 120, OFFER: 4 }, server, moved)).toBe(119);
  expect(columnTotal("OFFER", { ...zeroTotals(), SAVED: 120, OFFER: 4 }, server, moved)).toBe(5);
});

function zeroTotals() {
  return Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<ApplicationStatus, number>;
}
