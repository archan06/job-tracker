"use client";

import { useDroppable } from "@dnd-kit/core";
import Link from "next/link";
import type { BoardCard } from "@/lib/board";
import { STATUS_LABELS, type ApplicationStatus } from "@/lib/status";
import { STATUS_STYLES } from "@/components/applications/status-styles";
import { ApplicationCard } from "./application-card";

export function BoardColumn({ status, cards, total, onStatusChange }: {
  status: ApplicationStatus;
  cards: BoardCard[];
  total: number;
  onStatusChange: (id: string, status: ApplicationStatus) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const headingId = `column-heading-${status}`;
  return (
    <section
      ref={setNodeRef}
      data-testid={`column-${status}`}
      aria-labelledby={headingId}
      className={`flex w-[min(18rem,calc(100vw-3rem))] shrink-0 snap-start flex-col rounded-xl border-t-[3px] bg-surface-muted/70 p-2 ring-1 ring-border transition-[box-shadow,background-color] duration-150 dark:bg-surface/50 ${
        STATUS_STYLES[status].column
      } ${isOver ? "bg-surface-hover ring-2 ring-ring/50" : ""}`}
    >
      <header className="flex items-center justify-between px-1.5 pt-1 pb-3">
        <h2 id={headingId} className="flex items-center gap-2 text-sm font-semibold text-text">
          <span aria-hidden className={`size-2 rounded-full ${STATUS_STYLES[status].dot}`} />
          {STATUS_LABELS[status]}
        </h2>
        <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-muted tabular-nums ring-1 ring-border">
          {total.toLocaleString("en-US")}
        </span>
      </header>
      {cards.length === 0 ? (
        <p className="flex min-h-24 items-center justify-center rounded-lg border border-dashed border-border-strong px-3 text-center text-sm text-subtle">
          No applications
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {cards.map((card) => (
            <ApplicationCard key={card.id} card={card} onStatusChange={onStatusChange} />
          ))}
        </ul>
      )}
      {total > cards.length && (
        // The board shows the newest cards per column; the table has the rest.
        <Link
          href={`/applications?status=${status}`}
          className="mt-2 rounded-lg px-2 py-2 text-center text-sm font-medium text-primary-text hover:bg-surface-hover"
        >
          View all {total.toLocaleString("en-US")} in the table
        </Link>
      )}
    </section>
  );
}
