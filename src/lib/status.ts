import { ApplicationSource, ApplicationStatus } from "@/generated/prisma/enums";

export { ApplicationSource, ApplicationStatus };

/** Board column order. */
export const STATUSES = [
  "SAVED",
  "APPLIED",
  "INTERVIEW",
  "OFFER",
  "REJECTED",
  "WITHDRAWN",
] as const satisfies readonly ApplicationStatus[];

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  SAVED: "Saved",
  APPLIED: "Applied",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

export const SOURCES = [
  "REFERRAL",
  "LINKEDIN",
  "COMPANY_SITE",
  "COLD_APPLY",
  "OTHER",
] as const satisfies readonly ApplicationSource[];

export const SOURCE_LABELS: Record<ApplicationSource, string> = {
  REFERRAL: "Referral",
  LINKEDIN: "LinkedIn",
  COMPANY_SITE: "Company site",
  COLD_APPLY: "Cold apply",
  OTHER: "Other",
};

/** Event types a user can add by hand. STATUS_CHANGE is only written by the status service. */
export const USER_EVENT_TYPES = ["NOTE", "INTERVIEW", "EMAIL", "FOLLOW_UP"] as const;
export type UserEventType = (typeof USER_EVENT_TYPES)[number];
