import { STATUSES, type ApplicationStatus } from "@/lib/status";

export type BoardCard = {
  id: string;
  company: string;
  companyDomain: string | null;
  title: string;
  location: string | null;
  status: ApplicationStatus;
  updatedAt: Date;
  dateApplied: Date | null;
};

export type BoardColumns = Record<ApplicationStatus, BoardCard[]>;

const newestFirst = (a: BoardCard, b: BoardCard) => b.updatedAt.getTime() - a.updatedAt.getTime();

/** One column per status, in board order, each sorted by most recent activity. */
export function groupByStatus(cards: BoardCard[]): BoardColumns {
  const columns = Object.fromEntries(STATUSES.map((s) => [s, [] as BoardCard[]])) as BoardColumns;
  for (const card of cards) columns[card.status].push(card);
  for (const status of STATUSES) columns[status].sort(newestFirst);
  return columns;
}

/** The optimistic board update: moves a card to the top of another column. Returns `columns` itself when nothing changes. */
export function moveCard(columns: BoardColumns, id: string, to: ApplicationStatus, now: Date): BoardColumns {
  const from = STATUSES.find((s) => columns[s].some((card) => card.id === id));
  if (!from || from === to) return columns;
  const card = columns[from].find((c) => c.id === id)!;
  return {
    ...columns,
    [from]: columns[from].filter((c) => c.id !== id),
    [to]: [{ ...card, status: to, updatedAt: now }, ...columns[to]],
  };
}

/** A column's count while a move is in flight: the server's total, adjusted by the optimistic change. */
export function columnTotal(
  status: ApplicationStatus,
  serverTotals: Record<ApplicationStatus, number>,
  serverColumns: BoardColumns,
  optimisticColumns: BoardColumns,
): number {
  return serverTotals[status] + optimisticColumns[status].length - serverColumns[status].length;
}
