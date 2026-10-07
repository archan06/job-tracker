"use client";

import { STATUSES, STATUS_LABELS, type ApplicationStatus } from "@/lib/status";

/** The non-drag way to move a card: works with touch, keyboard and screen readers. */
export function StatusSelect({ value, label, onChange, className = "" }: {
  value: ApplicationStatus;
  label: string;
  onChange: (status: ApplicationStatus) => void;
  className?: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as ApplicationStatus)}
      // Keep Space/Enter on the select from starting a keyboard drag of the card.
      onKeyDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className={`h-8 rounded-lg border border-border bg-surface-muted px-2 pr-7 text-base text-muted outline-none transition-colors hover:text-text focus:border-ring focus:ring-3 focus:ring-ring/40 sm:text-xs [@media(pointer:coarse)]:text-base ${className}`}
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  );
}
