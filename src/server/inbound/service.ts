import type { InboundEmail, InboundEmailState, Prisma } from "@/generated/prisma/client";
import { normalizeDomain } from "@/lib/company-domain";
import { todayUtc } from "@/lib/dates";
import { inboundAddress, newInboundToken, tokenFromRecipients } from "@/lib/inbound/address";
import { isAtsDomain, senderDomain } from "@/lib/inbound/companies";
import { decideEmail, targetStatus, type Classification } from "@/lib/inbound/decide";
import { gmailForwardingCode } from "@/lib/inbound/forwarding";
import { snippet } from "@/lib/inbound/text";
import { db } from "@/server/db";
import {
  applyEmailChange,
  createApplicationFromEmail,
  revertEmailChange,
  type EmailChange,
  type EmailChangeRecord,
} from "@/server/services/applications";
import { NotFoundError } from "@/server/services/errors";
import { enforceWriteLimit, rateLimit } from "@/server/services/rate-limit";
import type { EmailClassifier } from "./classifier";
import type { FetchedEmail, InboundProvider, ReceivedEvent } from "./provider";

export const MONTHLY_EMAILS_PER_USER = 200;
/** App-wide, under Resend's free 100 received emails a day. */
export const DAILY_EMAILS = 90;
const RETENTION_MS = 90 * 24 * 60 * 60_000;
const SNIPPET_CHARS = 500;

export type InboundDeps = { provider: InboundProvider; classifier: EmailClassifier; domain: string };

/** A review action that can't be done as asked (shown to the user as-is). */
export class ReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewError";
  }
}

// ── Address ──────────────────────────────────────────────────────────────

export async function getOrCreateInboundAddress(userId: string, domain: string): Promise<string> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { inboundToken: true } });
  if (user.inboundToken) return inboundAddress(user.inboundToken, domain);
  return regenerateInboundAddress(userId, domain);
}

/** A new private address; the old one stops working immediately. */
export async function regenerateInboundAddress(userId: string, domain: string): Promise<string> {
  const token = newInboundToken();
  await db.user.update({ where: { id: userId }, data: { inboundToken: token } });
  return inboundAddress(token, domain);
}

// ── Processing ───────────────────────────────────────────────────────────

const startOfMonthUtc = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

function validDate(iso: string | null): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : todayUtc(date);
}

function changeFor(c: Classification, emailDate: Date, toStatus: EmailChange["toStatus"], addInterview: boolean): EmailChange {
  return {
    toStatus,
    date: todayUtc(emailDate),
    summary: c.summary,
    interviewDate: addInterview ? (validDate(c.interviewAt) ?? todayUtc(emailDate)) : null,
  };
}

const classificationFields = (c: Classification) => ({
  kind: c.kind,
  confidence: c.confidence,
  company: c.company?.slice(0, 100) ?? null,
  jobTitle: c.jobTitle?.slice(0, 150) ?? null,
  companyDomain: c.companyDomain,
  interviewAt: c.interviewAt ? validDate(c.interviewAt) : null,
  summary: c.summary,
});

const changeFields = (record: EmailChangeRecord, created: boolean) => ({
  state: "UPDATED" as const,
  reviewReason: null,
  applicationId: record.applicationId,
  createdApplication: created,
  previousStatus: record.previousStatus,
  previousDateApplied: record.previousDateApplied,
  appliedStatus: record.appliedStatus,
  eventIds: record.eventIds,
  applicationUpdatedAt: record.updatedAt,
});

/** The company's own website from the classifier or the sender, never a job board's. */
function employerDomain(c: Classification, from: string): string | null {
  const fromModel = c.companyDomain ? normalizeDomain(c.companyDomain) : null;
  if (fromModel && !isAtsDomain(fromModel)) return fromModel;
  return senderDomain(from);
}

/** Classifies (or recognizes) one fetched email and decides what to do. Returns the fields to store. */
async function process(userId: string, email: FetchedEmail, classifier: EmailClassifier) {
  const forwardingCode = gmailForwardingCode(email.from, email.subject, email.text);
  if (forwardingCode) return { kind: "GMAIL_FORWARDING_CONFIRMATION" as const, state: "IGNORED" as const, forwardingCode };

  let c: Classification;
  try {
    c = await classifier.classify(email);
  } catch (error) {
    console.warn("email classification failed", error);
    return { state: "FAILED" as const, reviewReason: "Couldn't read this email" };
  }

  const candidates = await db.application.findMany({
    where: { userId },
    select: { id: true, company: true, companyDomain: true, title: true, status: true },
  });
  const sender = senderDomain(email.from);
  const decision = decideEmail(c, candidates, sender);
  const fields = classificationFields(c);

  switch (decision.kind) {
    case "IGNORE":
      return { ...fields, state: "IGNORED" as const };
    case "REVIEW":
      return { ...fields, state: "NEEDS_REVIEW" as const, reviewReason: decision.reason };
    case "UPDATE": {
      const change = changeFor(c, email.date, decision.toStatus, decision.addInterview);
      return { ...fields, apply: (tx: Parameters<typeof applyEmailChange>[0]) => applyEmailChange(tx, userId, decision.applicationId, change), created: false };
    }
    case "CREATE": {
      const change = changeFor(c, email.date, null, false);
      const input = { company: c.company!, title: c.jobTitle!, companyDomain: employerDomain(c, email.from), status: "APPLIED" as const };
      return { ...fields, apply: (tx: Parameters<typeof applyEmailChange>[0]) => createApplicationFromEmail(tx, userId, input, change), created: true };
    }
  }
}

type Processed = Awaited<ReturnType<typeof process>>;

/** Stores the outcome, applying any board change in the same transaction. */
type BaseFields = { providerId: string; messageId: string; fromAddress: string; subject: string; receivedAt: Date; snippet: string };

async function store(processed: Processed, data: BaseFields, userId: string, existingId?: string) {
  await db.$transaction(async (tx) => {
    let outcome: Record<string, unknown>;
    if ("apply" in processed) {
      const { apply, created, ...fields } = processed;
      outcome = { ...fields, ...changeFields(await apply(tx), created) };
    } else {
      outcome = processed;
    }
    if (existingId) {
      await tx.inboundEmail.update({ where: { id: existingId }, data: { ...data, ...outcome } as Prisma.InboundEmailUncheckedUpdateInput });
    } else {
      await tx.inboundEmail.create({ data: { ...data, ...outcome, userId } as Prisma.InboundEmailUncheckedCreateInput });
    }
  });
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "P2002";
}

/**
 * Handles one received-email webhook: finds the user by their private address, enforces limits,
 * fetches and classifies the email, updates the board (or queues it for review) and records it.
 */
export async function ingestEmail(event: ReceivedEvent, deps: InboundDeps, now = new Date()): Promise<{ status: "ignored" | "duplicate" | "stored" }> {
  if (event.type !== "email.received") return { status: "ignored" };
  const token = tokenFromRecipients(event.recipients, deps.domain);
  if (!token) return { status: "ignored" };
  const user = await db.user.findUnique({ where: { inboundToken: token }, select: { id: true } });
  if (!user) return { status: "ignored" };

  await db.inboundEmail.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - RETENTION_MS) } } });
  if (await db.inboundEmail.findUnique({ where: { userId_messageId: { userId: user.id, messageId: event.messageId } } })) {
    return { status: "duplicate" };
  }

  const base = {
    providerId: event.emailId,
    messageId: event.messageId,
    fromAddress: event.from.slice(0, 300),
    subject: event.subject.slice(0, 300),
    receivedAt: event.createdAt,
    snippet: "",
  };

  let processed: Processed;
  const thisMonth = await db.inboundEmail.count({ where: { userId: user.id, createdAt: { gte: startOfMonthUtc(now) } } });
  if (thisMonth >= MONTHLY_EMAILS_PER_USER) {
    processed = { state: "FAILED", reviewReason: "Monthly limit reached" };
  } else if (!(await rateLimit("inbound:day", DAILY_EMAILS, 24 * 60 * 60_000, now)).ok) {
    processed = { state: "FAILED", reviewReason: "Daily limit reached. Retry tomorrow" };
  } else {
    let email: FetchedEmail;
    try {
      email = await deps.provider.fetch(event.emailId);
      base.snippet = snippet(email.text, SNIPPET_CHARS);
      processed = await process(user.id, email, deps.classifier);
    } catch (error) {
      console.warn("inbound email fetch failed", error);
      processed = { state: "FAILED", reviewReason: "Couldn't download this email" };
    }
  }

  try {
    await store(processed, base, user.id);
  } catch (error) {
    if (isUniqueViolation(error)) return { status: "duplicate" };
    throw error;
  }
  return { status: "stored" };
}

// ── Inbox and actions (signed-in user) ───────────────────────────────────

async function ownedEmail(userId: string, id: string, states: InboundEmailState[]): Promise<InboundEmail> {
  const email = await db.inboundEmail.findFirst({ where: { id, userId } });
  if (!email) throw new NotFoundError();
  if (!states.includes(email.state)) throw new ReviewError("This email was already handled.");
  return email;
}

export function listInbox(userId: string, state: InboundEmailState) {
  return db.inboundEmail.findMany({ where: { userId, state }, orderBy: { createdAt: "desc" }, take: 100 });
}

/** Emails that need the user: to review or couldn't be read. */
export function inboxBadgeCount(userId: string): Promise<number> {
  return db.inboundEmail.count({ where: { userId, state: { in: ["NEEDS_REVIEW", "FAILED"] } } });
}

/** The latest Gmail forwarding confirmation code, shown during setup. */
export async function latestForwardingCode(userId: string): Promise<string | null> {
  const email = await db.inboundEmail.findFirst({
    where: { userId, kind: "GMAIL_FORWARDING_CONFIRMATION" },
    orderBy: { createdAt: "desc" },
    select: { forwardingCode: true },
  });
  return email?.forwardingCode ?? null;
}

export async function undoEmail(userId: string, id: string): Promise<void> {
  const email = await ownedEmail(userId, id, ["UPDATED"]);
  await enforceWriteLimit(userId);
  if (email.applicationId && email.applicationUpdatedAt) {
    await revertEmailChange(
      userId,
      {
        applicationId: email.applicationId,
        previousStatus: email.previousStatus,
        previousDateApplied: email.previousDateApplied,
        eventIds: email.eventIds,
        updatedAt: email.applicationUpdatedAt,
      },
      email.createdApplication,
    );
  }
  await db.inboundEmail.update({ where: { id }, data: { state: "UNDONE" } });
}

function reviewedKind(email: InboundEmail) {
  if (!email.kind || email.kind === "NOT_JOB_RELATED" || email.kind === "GMAIL_FORWARDING_CONFIRMATION") {
    throw new ReviewError("Landed couldn't tell what this email is about.");
  }
  return email.kind;
}

const reviewedChange = (email: InboundEmail, toStatus: EmailChange["toStatus"]): EmailChange => ({
  toStatus,
  date: todayUtc(email.receivedAt),
  summary: email.summary ?? email.subject,
  interviewDate: email.kind === "INTERVIEW" ? (email.interviewAt ?? todayUtc(email.receivedAt)) : null,
});

/** Review: apply this email to one of the user's applications. */
export async function applyReview(userId: string, id: string, applicationId: string): Promise<void> {
  const email = await ownedEmail(userId, id, ["NEEDS_REVIEW"]);
  const kind = reviewedKind(email);
  await enforceWriteLimit(userId);
  await db.$transaction(async (tx) => {
    const application = await tx.application.findFirst({ where: { id: applicationId, userId }, select: { status: true } });
    if (!application) throw new NotFoundError();
    const record = await applyEmailChange(tx, userId, applicationId, reviewedChange(email, targetStatus(kind, application.status)));
    await tx.inboundEmail.update({ where: { id }, data: changeFields(record, false) });
  });
}

/** Review: create a new application from this email. */
export async function createFromReview(userId: string, id: string): Promise<void> {
  const email = await ownedEmail(userId, id, ["NEEDS_REVIEW"]);
  const kind = reviewedKind(email);
  if (!email.company || !email.jobTitle) throw new ReviewError("This email needs a company and job title to create an application.");
  await enforceWriteLimit(userId);
  await db.$transaction(async (tx) => {
    const record = await createApplicationFromEmail(
      tx,
      userId,
      { company: email.company!, title: email.jobTitle!, companyDomain: email.companyDomain ? normalizeDomain(email.companyDomain) : null, status: targetStatus(kind, null) },
      reviewedChange(email, null),
    );
    await tx.inboundEmail.update({ where: { id }, data: changeFields(record, true) });
  });
}

export async function ignoreEmail(userId: string, id: string): Promise<void> {
  await ownedEmail(userId, id, ["NEEDS_REVIEW", "FAILED"]);
  await db.inboundEmail.update({ where: { id }, data: { state: "IGNORED" } });
}

/** Re-downloads and re-reads an email that couldn't be read. */
export async function retryEmail(userId: string, id: string, deps: InboundDeps, now = new Date()): Promise<void> {
  const email = await ownedEmail(userId, id, ["FAILED"]);
  await enforceWriteLimit(userId);
  if (!(await rateLimit("inbound:day", DAILY_EMAILS, 24 * 60 * 60_000, now)).ok) {
    throw new ReviewError("Landed has read its daily limit of emails. Try again tomorrow.");
  }
  let processed: Processed;
  let snippetText = email.snippet;
  try {
    const fetched = await deps.provider.fetch(email.providerId);
    snippetText = snippet(fetched.text, SNIPPET_CHARS);
    processed = await process(userId, fetched, deps.classifier);
  } catch (error) {
    console.warn("inbound email retry failed", error);
    processed = { state: "FAILED", reviewReason: "Couldn't download this email" };
  }
  await store(processed, { providerId: email.providerId, messageId: email.messageId, fromAddress: email.fromAddress, subject: email.subject, receivedAt: email.receivedAt, snippet: snippetText }, userId, id);
}
