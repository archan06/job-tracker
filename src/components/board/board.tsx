"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { useCallback, useId, useOptimistic, useState, useTransition } from "react";
import { columnTotal, moveCard, type BoardCard, type BoardColumns } from "@/lib/board";
import { localDateString } from "@/lib/dates";
import { STATUSES, STATUS_LABELS, type ApplicationStatus } from "@/lib/status";
import { Toast } from "@/components/ui/toast";
import { runAction } from "@/lib/run-action";
import { changeStatusAction } from "@/server/actions/applications";
import { CardBody } from "./application-card";
import { BoardColumn } from "./board-column";

const isStatus = (value: unknown): value is ApplicationStatus => STATUSES.includes(value as ApplicationStatus);

/** Left and right arrows jump a picked-up card one whole column at a time. */
const columnKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context }) => {
  const step = event.code === "ArrowRight" ? 1 : event.code === "ArrowLeft" ? -1 : 0;
  const { active, over, droppableRects, collisionRect } = context;
  if (!step || !collisionRect) return undefined;
  const current = isStatus(over?.id) ? over.id : (active?.data.current?.card as BoardCard | undefined)?.status;
  const next = current ? STATUSES[STATUSES.indexOf(current) + step] : undefined;
  const rect = next ? droppableRects.get(next) : undefined;
  if (!rect) return undefined;
  event.preventDefault();
  return { x: rect.left + (rect.width - collisionRect.width) / 2, y: rect.top + 48 };
};

/** Columns hold the newest cards per status; totals are the real counts (columns may be capped). */
export function Board({ columns, totals }: { columns: BoardColumns; totals: Record<ApplicationStatus, number> }) {
  // Shows the move immediately; React drops it and falls back to server data if the save fails.
  const [optimisticColumns, applyMove] = useOptimistic(
    columns,
    (current, move: { id: string; to: ApplicationStatus }) => moveCard(current, move.id, move.to, new Date()),
  );
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<BoardCard | null>(null);
  const dndId = useId();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Press and hold on touch screens, so a normal swipe still scrolls the board.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: columnKeyboardCoordinates }),
  );

  const move = useCallback(
    (id: string, to: ApplicationStatus) => {
      const current = STATUSES.find((s) => optimisticColumns[s].some((c) => c.id === id));
      if (!current || current === to) return;
      setError(null);
      startTransition(async () => {
        applyMove({ id, to });
        const result = await runAction(() => changeStatusAction(id, to, localDateString()));
        if (!result.ok) setError(result.error ?? "Couldn't move that card. Please try again.");
      });
    },
    [optimisticColumns, applyMove],
  );

  const findCard = (id: unknown) =>
    STATUSES.flatMap((s) => optimisticColumns[s]).find((c) => c.id === id) ?? null;

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${findCard(active.id)?.company ?? "application"}.`,
    onDragOver: ({ active, over }) =>
      over && isStatus(over.id)
        ? `${findCard(active.id)?.company ?? "Application"} is over ${STATUS_LABELS[over.id]}.`
        : undefined,
    onDragEnd: ({ active, over }) =>
      over && isStatus(over.id)
        ? `Moved ${findCard(active.id)?.company ?? "application"} to ${STATUS_LABELS[over.id]}.`
        : "Move cancelled.",
    onDragCancel: () => "Move cancelled.",
  };

  function onDragStart(event: DragStartEvent) {
    setActive(findCard(event.active.id));
  }

  function onDragEnd(event: DragEndEvent) {
    setActive(null);
    if (event.over && isStatus(event.over.id)) move(String(event.active.id), event.over.id);
  }

  return (
    <>
      <DndContext
        id={dndId}
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActive(null)}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              "To move an application, press Space, use the arrow keys to choose a column, then press Space again. Press Escape to cancel. You can also use the status menu on each card.",
          },
        }}
      >
        <div className="-mx-4 snap-x snap-mandatory scroll-px-4 overflow-x-auto overscroll-x-contain px-4 pb-4 sm:-mx-6 sm:snap-none sm:px-6">
          <div className="flex items-start gap-3">
            {STATUSES.map((status) => (
              <BoardColumn
                key={status}
                status={status}
                cards={optimisticColumns[status]}
                total={columnTotal(status, totals, columns, optimisticColumns)}
                onStatusChange={move}
              />
            ))}
          </div>
        </div>
        <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.23, 1, 0.32, 1)" }}>
          {active && (
            <div className="relative w-[min(17rem,calc(100vw-4rem))] rotate-[1.5deg] cursor-grabbing rounded-xl border border-border-strong bg-surface p-3.5 shadow-raised">
              <CardBody card={active} overlay />
            </div>
          )}
        </DragOverlay>
      </DndContext>
      <Toast message={error} onDismiss={() => setError(null)} />
    </>
  );
}
