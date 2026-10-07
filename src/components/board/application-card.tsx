"use client";

import { useDraggable } from "@dnd-kit/core";
import { CalendarBlank, MapPin } from "@phosphor-icons/react";
import Link from "next/link";
import { CompanyLogo } from "@/components/company-logo";
import type { BoardCard } from "@/lib/board";
import { formatDateOnly } from "@/lib/dates";
import type { ApplicationStatus } from "@/lib/status";
import { StatusSelect } from "./status-select";

type Props = {
  card: BoardCard;
  onStatusChange?: (id: string, status: ApplicationStatus) => void;
  overlay?: boolean;
};

export function CardBody({ card, onStatusChange, overlay }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <CompanyLogo company={card.company} domain={card.companyDomain} size="sm" />
          {overlay ? (
            <p className="min-w-0 truncate font-medium text-text">{card.company}</p>
          ) : (
            <Link
              href={`/applications/${card.id}`}
              title={card.company}
              dir="auto"
              className="block min-w-0 truncate font-medium text-text after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none"
            >
              {card.company}
            </Link>
          )}
        </div>
        <p dir="auto" className="mt-0.5 line-clamp-2 text-sm wrap-anywhere text-muted" title={card.title}>
          {card.title}
        </p>
      </div>
      {(card.location || card.dateApplied) && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
          {card.location && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin size={13} className="shrink-0" />
              <span className="truncate">{card.location}</span>
            </span>
          )}
          {card.dateApplied && (
            <span className="inline-flex items-center gap-1" title="Date applied">
              <CalendarBlank size={13} className="shrink-0" />
              {formatDateOnly(card.dateApplied)}
            </span>
          )}
        </div>
      )}
      {onStatusChange && (
        // Sits above the card-wide link so it stays usable.
        <div className="relative z-10">
          <StatusSelect
            value={card.status}
            label={`Status for ${card.company}`}
            onChange={(status) => onStatusChange(card.id, status)}
          />
        </div>
      )}
    </div>
  );
}

export function ApplicationCard({ card, onStatusChange }: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id, data: { card } });
  return (
    <li
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      aria-roledescription="draggable application"
      aria-label={`${card.company}, ${card.title}`}
      className={`relative cursor-grab touch-manipulation rounded-xl border border-border bg-surface p-3.5 shadow-card transition-[border-color,opacity] hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <CardBody card={card} onStatusChange={onStatusChange} />
    </li>
  );
}
