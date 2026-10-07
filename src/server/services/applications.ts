import type { Application, ApplicationSource, ApplicationStatus, Event, Prisma } from "@/generated/prisma/client";
import type { BoardCard } from "@/lib/board";
import { todayUtc } from "@/lib/dates";
import { STATUSES } from "@/lib/status";
import type { ApplicationInput } from "@/lib/validation/application";
import { db } from "@/server/db";
import { LimitReachedError, NotFoundError } from "./errors";

/** Hard cap per account; protects the database from scripted floods. */
export const MAX_APPLICATIONS_PER_USER = 5_000;

type Tx = Prisma.TransactionClient;

export type ApplicationSort = "company" | "title" | "status" | "dateApplied" | "updatedAt";

export type ApplicationFilters = {
  statuses?: ApplicationStatus[];
  sources?: ApplicationSource[];
  company?: string;
  appliedFrom?: Date;
  appliedTo?: Date;
  sort?: ApplicationSort;
  dir?: "asc" | "desc";
};

export type ApplicationWithEvents = Application & { events: Event[] };

/** The columns list views show. Descriptions and notes (up to 15k characters) stay out of lists. */
const SUMMARY_SELECT = {
  id: true,
  company: true,
  title: true,
  location: true,
  status: true,
  source: true,
  dateApplied: true,
  updatedAt: true,
} as const;

export type ApplicationSummary = Prisma.ApplicationGetPayload<{ select: typeof SUMMARY_SELECT }>;

export type Paging = { page?: number; pageSize?: number };

/** Every query in this module goes through the owner's id, so other users' rows look like they don't exist. */
async function findOwned(tx: Tx, userId: string, id: string): Promise<Application> {
  const application = await tx.application.findFirst({ where: { id, userId } });
  if (!application) throw new NotFoundError();
  return application;
}

/** `today` is the viewer's calendar day (see resolveToday); it defaults to the server's UTC date. */
export type DayOptions = { today?: Date };

/** Editable fields, with blanks stored as null so clearing a field in the form clears it here. */
function fieldsFrom(input: ApplicationInput) {
  return {
    company: input.company,
    title: input.title,
    url: input.url ?? null,
    location: input.location ?? null,
    salaryRange: input.salaryRange ?? null,
    source: input.source,
    dateApplied: input.dateApplied ?? null,
    description: input.description ?? null,
    notes: input.notes ?? null,
  };
}

/**
 * The only code that changes Application.status. It writes the STATUS_CHANGE event in the
 * same transaction, and the conditional update means two identical changes racing each
 * other produce one event, not two.
 */
async function applyStatusChange(
  tx: Tx,
  application: Application,
  toStatus: ApplicationStatus,
  today: Date,
): Promise<Application> {
  if (application.status === toStatus) return application;
  const fillDateApplied = toStatus === "APPLIED" && !application.dateApplied;
  const { count } = await tx.application.updateMany({
    where: { id: application.id, userId: application.userId, status: application.status },
    data: { status: toStatus, ...(fillDateApplied ? { dateApplied: today } : {}) },
  });
  if (count === 1) {
    await tx.event.create({
      data: { applicationId: application.id, type: "STATUS_CHANGE", fromStatus: application.status, toStatus, date: today },
    });
  }
  return tx.application.findUniqueOrThrow({ where: { id: application.id } });
}

function whereFor(userId: string, filters: ApplicationFilters): Prisma.ApplicationWhereInput {
  const { statuses, sources, company, appliedFrom, appliedTo } = filters;
  const where: Prisma.ApplicationWhereInput = { userId };
  if (statuses?.length) where.status = { in: statuses };
  if (sources?.length) where.source = { in: sources };
  if (company) where.company = { contains: company, mode: "insensitive" };
  if (appliedFrom || appliedTo) where.dateApplied = { gte: appliedFrom, lte: appliedTo };
  return where;
}

/** One page of the table (all rows when no pageSize is given). */
export async function listApplications(
  userId: string,
  filters: ApplicationFilters = {},
  { page = 1, pageSize }: Paging = {},
): Promise<ApplicationSummary[]> {
  const { sort = "updatedAt", dir = "desc" } = filters;
  const orderBy: Prisma.ApplicationOrderByWithRelationInput[] = [
    sort === "dateApplied" ? { dateApplied: { sort: dir, nulls: "last" } } : { [sort]: dir },
    { id: "asc" },
  ];
  return db.application.findMany({
    where: whereFor(userId, filters),
    orderBy,
    select: SUMMARY_SELECT,
    ...(pageSize ? { take: pageSize, skip: (Math.max(1, page) - 1) * pageSize } : {}),
  });
}

export function countApplications(userId: string, filters: ApplicationFilters = {}): Promise<number> {
  return db.application.count({ where: whereFor(userId, filters) });
}

export type Board = { columns: Record<ApplicationStatus, BoardCard[]>; totals: Record<ApplicationStatus, number> };

/** The newest `perColumn` cards in each status, plus each column's real total. */
export async function listBoard(userId: string, perColumn = 50): Promise<Board> {
  const select = { id: true, company: true, title: true, location: true, status: true, updatedAt: true, dateApplied: true } as const;
  const [counts, ...columns] = await Promise.all([
    db.application.groupBy({ by: ["status"], where: { userId }, _count: { _all: true } }),
    ...STATUSES.map((status) =>
      db.application.findMany({
        where: { userId, status },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
        take: perColumn,
        select,
      }),
    ),
  ]);
  const totals = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<ApplicationStatus, number>;
  for (const row of counts) totals[row.status] = row._count._all;
  return {
    columns: Object.fromEntries(STATUSES.map((s, i) => [s, columns[i]])) as Record<ApplicationStatus, BoardCard[]>,
    totals,
  };
}

export async function getApplication(userId: string, id: string): Promise<ApplicationWithEvents> {
  const application = await db.application.findFirst({
    where: { id, userId },
    include: { events: { orderBy: [{ date: "desc" }, { createdAt: "desc" }, { id: "desc" }] } },
  });
  if (!application) throw new NotFoundError();
  return application;
}

export async function createApplication(
  userId: string,
  input: ApplicationInput,
  { today = todayUtc() }: DayOptions = {},
): Promise<Application> {
  return db.$transaction(async (tx) => {
    if ((await tx.application.count({ where: { userId } })) >= MAX_APPLICATIONS_PER_USER) {
      throw new LimitReachedError(
        `You've reached the limit of ${MAX_APPLICATIONS_PER_USER.toLocaleString("en-US")} applications. Delete some to add more.`,
      );
    }
    const status = input.status;
    const fields = fieldsFrom(input);
    if (status === "APPLIED" && !fields.dateApplied) fields.dateApplied = today;
    const application = await tx.application.create({ data: { ...fields, status, userId } });
    await tx.event.create({
      data: { applicationId: application.id, type: "STATUS_CHANGE", fromStatus: null, toStatus: status, date: today },
    });
    return application;
  });
}

export async function updateApplication(
  userId: string,
  id: string,
  input: ApplicationInput,
  { today = todayUtc() }: DayOptions = {},
): Promise<Application> {
  return db.$transaction(async (tx) => {
    await findOwned(tx, userId, id);
    const updated = await tx.application.update({ where: { id }, data: fieldsFrom(input) });
    return applyStatusChange(tx, updated, input.status, today);
  });
}

export async function changeStatus(
  userId: string,
  id: string,
  toStatus: ApplicationStatus,
  { today = todayUtc() }: DayOptions = {},
): Promise<Application> {
  return db.$transaction(async (tx) => applyStatusChange(tx, await findOwned(tx, userId, id), toStatus, today));
}

export async function deleteApplication(userId: string, id: string): Promise<void> {
  const { count } = await db.application.deleteMany({ where: { id, userId } });
  if (count === 0) throw new NotFoundError();
}
