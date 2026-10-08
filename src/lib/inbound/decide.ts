import type { ApplicationStatus } from "@/lib/status";
import { normalizeCompany } from "./companies";

export const EMAIL_KINDS = ["APPLICATION_CONFIRMATION", "INTERVIEW", "REJECTION", "OFFER", "NOT_JOB_RELATED"] as const;
export type EmailKind = (typeof EMAIL_KINDS)[number];

/** What the classifier read from one email. */
export type Classification = {
  kind: EmailKind;
  confidence: number;
  company: string | null;
  jobTitle: string | null;
  companyDomain: string | null;
  interviewAt: string | null;
  summary: string;
};

export type Candidate = { id: string; company: string; companyDomain: string | null; title: string; status: ApplicationStatus };

export type Decision =
  | { kind: "IGNORE" }
  | { kind: "REVIEW"; reason: string }
  | { kind: "UPDATE"; applicationId: string; toStatus: ApplicationStatus | null; addInterview: boolean }
  | { kind: "CREATE" };

export const CONFIDENCE_THRESHOLD = 0.75;

const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** "stripe" and "stripe payments": one name's words begin the other's. */
function sameNameStart(a: string, b: string): boolean {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.length > 0 && (long === short || long.startsWith(`${short} `));
}

/** The single application this email is about, or why there isn't exactly one. */
function match(c: Classification, candidates: Candidate[], sender: string | null): Candidate | "none" | "several" {
  const company = c.company ? normalizeCompany(c.company) : "";
  // A named company must agree with the application: exactly, or, when the sender's domain also matches,
  // as a name variant ("Stripe" / "Stripe Payments"). The domain alone decides only if no company is named.
  const found = candidates.filter((a) => {
    const domainMatch = sender !== null && a.companyDomain === sender;
    if (!company) return domainMatch;
    const name = normalizeCompany(a.company);
    return name === company || (domainMatch && sameNameStart(name, company));
  });
  if (found.length <= 1) return found[0] ?? "none";
  if (!c.jobTitle) return "several";
  const title = words(c.jobTitle);
  const exact = found.filter((a) => words(a.title) === title);
  if (exact.length === 1) return exact[0];
  const close = found.filter((a) => title.includes(words(a.title)) || words(a.title).includes(title));
  return close.length === 1 ? close[0] : "several";
}

const update = (applicationId: string, toStatus: ApplicationStatus | null, addInterview = false): Decision => ({
  kind: "UPDATE", applicationId, toStatus, addInterview,
});
const review = (reason: string): Decision => ({ kind: "REVIEW", reason });

/**
 * What a forwarded email should do to the board. Pure: it only ever sees the candidates it's given
 * (the recipient's own applications), so it can't touch anyone else's.
 */
export function decideEmail(c: Classification, candidates: Candidate[], sender: string | null): Decision {
  if (c.kind === "NOT_JOB_RELATED") return { kind: "IGNORE" };
  if (c.confidence < CONFIDENCE_THRESHOLD) return review("Not sure what this email means");

  const found = match(c, candidates, sender);
  if (found === "several") return review("Several applications match this company");

  if (found === "none") {
    if (c.kind !== "APPLICATION_CONFIRMATION") return review("No matching application");
    return c.company && c.jobTitle ? { kind: "CREATE" } : review("Couldn't tell the company or job title");
  }

  const s = found.status;
  switch (c.kind) {
    case "APPLICATION_CONFIRMATION":
      return update(found.id, s === "SAVED" ? "APPLIED" : null);
    case "INTERVIEW":
      if (s === "OFFER" || s === "REJECTED" || s === "WITHDRAWN") return review(`Interview email, but it's already ${s.toLowerCase()}`);
      return update(found.id, s === "INTERVIEW" ? null : "INTERVIEW", true);
    case "REJECTION":
      if (s === "OFFER") return review("Rejection email, but you have an offer");
      return update(found.id, s === "REJECTED" ? null : "REJECTED");
    case "OFFER":
      return update(found.id, s === "OFFER" ? null : "OFFER");
  }
}

/** The status a user-confirmed email moves an application to (review "Apply to"): the user's choice wins, even backwards. */
export function targetStatus(kind: Exclude<EmailKind, "NOT_JOB_RELATED">, current: ApplicationStatus | null): ApplicationStatus {
  switch (kind) {
    case "APPLICATION_CONFIRMATION":
      return current && current !== "SAVED" ? current : "APPLIED";
    case "INTERVIEW":
      return "INTERVIEW";
    case "REJECTION":
      return "REJECTED";
    case "OFFER":
      return "OFFER";
  }
}
