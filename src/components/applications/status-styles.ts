import type { ApplicationStatus } from "@/lib/status";

/** Full class names per status, written out so Tailwind can find them. */
export const STATUS_STYLES: Record<ApplicationStatus, { dot: string; badge: string; column: string }> = {
  SAVED: {
    dot: "bg-status-saved",
    badge: "bg-status-saved-soft text-status-saved-text",
    column: "border-t-status-saved",
  },
  APPLIED: {
    dot: "bg-status-applied",
    badge: "bg-status-applied-soft text-status-applied-text",
    column: "border-t-status-applied",
  },
  INTERVIEW: {
    dot: "bg-status-interview",
    badge: "bg-status-interview-soft text-status-interview-text",
    column: "border-t-status-interview",
  },
  OFFER: {
    dot: "bg-status-offer",
    badge: "bg-status-offer-soft text-status-offer-text",
    column: "border-t-status-offer",
  },
  REJECTED: {
    dot: "bg-status-rejected",
    badge: "bg-status-rejected-soft text-status-rejected-text",
    column: "border-t-status-rejected",
  },
  WITHDRAWN: {
    dot: "bg-status-withdrawn",
    badge: "bg-status-withdrawn-soft text-status-withdrawn-text",
    column: "border-t-status-withdrawn",
  },
};
