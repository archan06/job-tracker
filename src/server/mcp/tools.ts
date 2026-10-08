import type { z } from "zod";
import type { Application, Event } from "@/generated/prisma/client";
import { toDateInputValue } from "@/lib/dates";
import { STATUSES, type ApplicationSource, type ApplicationStatus } from "@/lib/status";
import { applicationInputSchema } from "@/lib/validation/application";
import { eventInputSchema } from "@/lib/validation/event";
import { db } from "@/server/db";
import {
  changeStatus,
  countApplications,
  createApplication,
  getApplication,
  listApplications,
  listBoard,
  updateApplication,
  type ApplicationSort,
} from "@/server/services/applications";
import { addEvent } from "@/server/services/events";
import { enforceMcpReadLimit, enforceWriteLimit } from "@/server/services/rate-limit";

const STALE_DAYS = 14;
const DAY_MS = 24 * 60 * 60_000;

/** Input the assistant can fix: the message is the same plain-English text the website shows. */
export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolInputError";
  }
}

function parseOrThrow<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new ToolInputError([...new Set(parsed.error.issues.map((i) => i.message))].join("; "));
  return parsed.data;
}

const day = (date: Date | null) => (date ? toDateInputValue(date) : null);

function summary(a: Pick<Application, "id" | "company" | "title" | "status" | "location" | "dateApplied" | "updatedAt">) {
  return {
    id: a.id,
    company: a.company,
    title: a.title,
    status: a.status,
    location: a.location,
    dateApplied: day(a.dateApplied),
    updatedAt: a.updatedAt.toISOString(),
  };
}

function details(a: Application) {
  return {
    ...summary(a),
    companyDomain: a.companyDomain,
    url: a.url,
    salaryRange: a.salaryRange,
    source: a.source,
    description: a.description,
    notes: a.notes,
    createdAt: a.createdAt.toISOString(),
  };
}

function timelineEntry(e: Event) {
  return { type: e.type, date: day(e.date), fromStatus: e.fromStatus, toStatus: e.toStatus, notes: e.notes };
}

// ── Reads ────────────────────────────────────────────────────────────────

export type SearchArgs = {
  company?: string;
  statuses?: ApplicationStatus[];
  sources?: ApplicationSource[];
  sort?: ApplicationSort;
  dir?: "asc" | "desc";
  limit?: number;
};

export async function searchApplicationsTool(userId: string, { limit = 20, ...filters }: SearchArgs) {
  await enforceMcpReadLimit(userId);
  const pageSize = Math.min(Math.max(limit, 1), 50);
  const [rows, total] = await Promise.all([
    listApplications(userId, filters, { page: 1, pageSize }),
    countApplications(userId, filters),
  ]);
  return { total, applications: rows.map(summary) };
}

export async function getApplicationTool(userId: string, { id }: { id: string }) {
  await enforceMcpReadLimit(userId);
  const { events, ...application } = await getApplication(userId, id);
  return { ...details(application), timeline: events.map(timelineEntry) };
}

export async function pipelineSummaryTool(userId: string, now = new Date()) {
  await enforceMcpReadLimit(userId);
  const [{ totals }, stale] = await Promise.all([
    listBoard(userId, 0),
    db.application.findMany({
      where: { userId, status: { in: ["APPLIED", "INTERVIEW"] }, updatedAt: { lt: new Date(now.getTime() - STALE_DAYS * DAY_MS) } },
      orderBy: { updatedAt: "asc" },
      take: 20,
      select: { id: true, company: true, title: true, status: true, location: true, dateApplied: true, updatedAt: true },
    }),
  ]);
  return {
    total: STATUSES.reduce((sum, s) => sum + totals[s], 0),
    counts: totals,
    stale: stale.map((a) => ({ ...summary(a), daysSinceUpdate: Math.floor((now.getTime() - a.updatedAt.getTime()) / DAY_MS) })),
  };
}

// ── Writes ───────────────────────────────────────────────────────────────

/** Fields the assistant can set. `null` clears an optional field. */
export type ApplicationFields = {
  company?: string;
  title?: string;
  url?: string | null;
  companyDomain?: string | null;
  location?: string | null;
  salaryRange?: string | null;
  status?: ApplicationStatus;
  source?: ApplicationSource;
  dateApplied?: string | null;
  description?: string | null;
  notes?: string | null;
};

// null means "clear": the form schema treats blanks as not provided, which saves as null.
const blankNulls = (fields: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v === null ? "" : v]));

export async function addApplicationTool(userId: string, fields: ApplicationFields) {
  const input = parseOrThrow(applicationInputSchema, blankNulls(fields));
  await enforceWriteLimit(userId);
  return details(await createApplication(userId, input));
}

export async function updateApplicationTool(userId: string, { id, ...changes }: ApplicationFields & { id: string }) {
  const current = await getApplication(userId, id);
  const merged = {
    company: current.company,
    title: current.title,
    url: current.url,
    companyDomain: current.companyDomain,
    location: current.location,
    salaryRange: current.salaryRange,
    status: current.status,
    source: current.source,
    dateApplied: current.dateApplied,
    description: current.description,
    notes: current.notes,
    ...changes,
  };
  const input = parseOrThrow(applicationInputSchema, blankNulls(merged));
  await enforceWriteLimit(userId);
  return details(await updateApplication(userId, id, input));
}

export async function changeStatusTool(userId: string, { id, status }: { id: string; status: ApplicationStatus }) {
  await enforceWriteLimit(userId);
  return details(await changeStatus(userId, id, status));
}

export async function addTimelineEntryTool(
  userId: string,
  { id, type, date, notes }: { id: string; type: "NOTE" | "INTERVIEW" | "EMAIL" | "FOLLOW_UP"; date?: string; notes?: string },
) {
  const input = parseOrThrow(eventInputSchema, { type, date: date ?? toDateInputValue(new Date()), notes });
  await enforceWriteLimit(userId);
  return timelineEntry(await addEvent(userId, id, input));
}
