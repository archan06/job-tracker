import type { EventType } from "@/generated/prisma/enums";
import { STATUS_LABELS, type ApplicationStatus } from "@/lib/status";

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  STATUS_CHANGE: "Status change",
  INTERVIEW: "Interview",
  EMAIL: "Email",
  NOTE: "Note",
  FOLLOW_UP: "Follow-up",
};

type EventSummary = { type: EventType; fromStatus: ApplicationStatus | null; toStatus: ApplicationStatus | null };

/** One-line headline for a timeline entry. */
export function describeEvent(event: EventSummary): string {
  if (event.type !== "STATUS_CHANGE" || !event.toStatus) return EVENT_TYPE_LABELS[event.type];
  if (!event.fromStatus) return `Added as ${STATUS_LABELS[event.toStatus]}`;
  return `${STATUS_LABELS[event.fromStatus]} → ${STATUS_LABELS[event.toStatus]}`;
}
