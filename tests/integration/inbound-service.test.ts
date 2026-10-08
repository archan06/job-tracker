import { beforeEach, expect, test, vi } from "vitest";
import type { Classification } from "@/lib/inbound/decide";
import { db } from "@/server/db";
import type { EmailClassifier } from "@/server/inbound/classifier";
import type { FetchedEmail, InboundProvider, ReceivedEvent } from "@/server/inbound/provider";
import {
  DAILY_EMAILS,
  DAILY_EMAILS_PER_USER,
  MONTHLY_EMAILS_PER_USER,
  ReviewError,
  applyReview,
  createFromReview,
  getOrCreateInboundAddress,
  inboxBadgeCount,
  ignoreEmail,
  ingestEmail,
  listInbox,
  regenerateInboundAddress,
  retryEmail,
  undoEmail,
} from "@/server/inbound/service";
import { NotFoundError } from "@/server/services/errors";
import { getApplication, updateApplication } from "@/server/services/applications";
import { applicationInputSchema } from "@/lib/validation/application";
import { makeApplication, makeUser } from "./factories";

const DOMAIN = "in.landed.test";
const EMAIL_DATE = new Date("2026-10-08T15:00:00Z");

beforeEach(async () => {
  await db.rateLimit.deleteMany();
});

let seq = 0;
function harness(classification: Partial<Classification> | Error = {}, content: Partial<FetchedEmail> = {}) {
  const classify = vi.fn(async () => {
    if (classification instanceof Error) throw classification;
    return {
      kind: "APPLICATION_CONFIRMATION", confidence: 0.95, company: "Stripe", jobTitle: "Software Engineer",
      companyDomain: null, interviewAt: null, summary: "Thanks for applying", ...classification,
    } as Classification;
  });
  const fetch = vi.fn(async (): Promise<FetchedEmail> => ({
    from: "Stripe <jobs@stripe.com>", subject: "Thanks for applying", text: "Thanks for applying to Stripe", date: EMAIL_DATE, messageId: "m", ...content,
  }));
  const deps = {
    provider: { verify: () => null, fetch } as InboundProvider,
    classifier: { classify } as EmailClassifier,
    domain: DOMAIN,
  };
  return { deps, classify, fetch };
}

async function addressFor(userId: string) {
  return getOrCreateInboundAddress(userId, DOMAIN);
}

type Received = Extract<ReceivedEvent, { type: "email.received" }>;
const event = (to: string, overrides: Partial<Received> = {}): Received => ({
  type: "email.received", emailId: `em_${++seq}`, messageId: `<msg-${seq}@mail>`, from: "Stripe <jobs@stripe.com>",
  subject: "Thanks for applying", recipients: [to], createdAt: EMAIL_DATE, ...overrides,
});

test("a confirmation with no matching application creates one, logged and undoable", async () => {
  const u = await makeUser();
  const to = await addressFor(u.id);
  const { deps } = harness();
  const result = await ingestEmail(event(to), deps);
  expect(result.status).toBe("stored");
  const [email] = await listInbox(u.id, "UPDATED");
  expect(email).toMatchObject({ state: "UPDATED", createdApplication: true, company: "Stripe" });
  const app = await getApplication(u.id, email.applicationId!);
  expect(app).toMatchObject({ company: "Stripe", title: "Software Engineer", status: "APPLIED" });
  expect(app.dateApplied?.toISOString().slice(0, 10)).toBe("2026-10-08");
  expect(app.events.some((e) => e.type === "EMAIL" && e.notes === "From email: Thanks for applying")).toBe(true);
  await undoEmail(u.id, email.id);
  await expect(getApplication(u.id, app.id)).rejects.toThrow(NotFoundError);
  expect((await listInbox(u.id, "UNDONE"))[0].id).toBe(email.id);
});

test("an interview email moves the matching application and logs an interview; undo restores it exactly", async () => {
  const u = await makeUser();
  const a = await makeApplication(u.id, { company: "Stripe, Inc.", title: "Software Engineer", status: "APPLIED" });
  const before = await getApplication(u.id, a.id);
  const { deps } = harness({ kind: "INTERVIEW", summary: "Phone screen Tue", interviewAt: "2026-10-13T18:00:00Z" });
  await ingestEmail(event(await addressFor(u.id)), deps);
  const after = await getApplication(u.id, a.id);
  expect(after.status).toBe("INTERVIEW");
  expect(after.events.find((e) => e.type === "INTERVIEW")?.date.toISOString().slice(0, 10)).toBe("2026-10-13");
  const [email] = await listInbox(u.id, "UPDATED");
  await undoEmail(u.id, email.id);
  const restored = await getApplication(u.id, a.id);
  expect(restored.status).toBe("APPLIED");
  expect(restored.events.map((e) => e.id).sort()).toEqual(before.events.map((e) => e.id).sort());
});

test("undo refuses once the application has been changed since", async () => {
  const u = await makeUser();
  const a = await makeApplication(u.id, { company: "Stripe", title: "Software Engineer", status: "APPLIED" });
  await ingestEmail(event(await addressFor(u.id)), harness({ kind: "REJECTION" }).deps);
  await updateApplication(u.id, a.id, applicationInputSchema.parse({ company: "Stripe", title: "Staff Engineer", status: "REJECTED" }));
  const [email] = await listInbox(u.id, "UPDATED");
  await expect(undoEmail(u.id, email.id)).rejects.toThrow("Changed since: edit it directly");
  expect((await getApplication(u.id, a.id)).title).toBe("Staff Engineer");
});

test("an email to user A never touches user B, even with the same company", async () => {
  const a = await makeUser();
  const b = await makeUser();
  const bApp = await makeApplication(b.id, { company: "Stripe", title: "Software Engineer", status: "APPLIED" });
  await ingestEmail(event(await addressFor(a.id)), harness({ kind: "OFFER" }).deps);
  expect((await getApplication(b.id, bApp.id)).status).toBe("APPLIED");
  expect(await listInbox(b.id, "NEEDS_REVIEW")).toEqual([]);
  expect(await listInbox(a.id, "NEEDS_REVIEW")).toHaveLength(1);
});

test("review actions only work on your own emails and applications", async () => {
  const a = await makeUser();
  const b = await makeUser();
  const bApp = await makeApplication(b.id, { company: "Acme" });
  await ingestEmail(event(await addressFor(a.id)), harness({ kind: "OFFER", company: "Unknown Co" }).deps);
  const [email] = await listInbox(a.id, "NEEDS_REVIEW");
  await expect(applyReview(a.id, email.id, bApp.id)).rejects.toThrow(NotFoundError);
  await expect(applyReview(b.id, email.id, bApp.id)).rejects.toThrow(NotFoundError);
  await expect(undoEmail(b.id, email.id)).rejects.toThrow(NotFoundError);
  expect((await getApplication(b.id, bApp.id)).status).toBe("SAVED");
});

test("apply-to and create-from review, and ignore", async () => {
  const u = await makeUser();
  const target = await makeApplication(u.id, { company: "Stripe (old name)", status: "APPLIED" });
  const to = await addressFor(u.id);
  await ingestEmail(event(to), harness({ kind: "OFFER", company: "Stripe Payments" }).deps);
  const [offer] = await listInbox(u.id, "NEEDS_REVIEW");
  await applyReview(u.id, offer.id, target.id);
  expect((await getApplication(u.id, target.id)).status).toBe("OFFER");
  expect((await listInbox(u.id, "UPDATED"))[0].id).toBe(offer.id);

  await ingestEmail(event(to), harness({ kind: "INTERVIEW", company: "Figma", jobTitle: "Designer" }).deps);
  const [interview] = await listInbox(u.id, "NEEDS_REVIEW");
  await createFromReview(u.id, interview.id);
  const created = (await listInbox(u.id, "UPDATED")).find((e) => e.id === interview.id)!;
  expect((await getApplication(u.id, created.applicationId!)).status).toBe("INTERVIEW");

  await ingestEmail(event(to), harness({ kind: "OFFER", company: null, jobTitle: null }).deps);
  const [vague] = await listInbox(u.id, "NEEDS_REVIEW");
  await expect(createFromReview(u.id, vague.id)).rejects.toThrow(ReviewError);
  await ignoreEmail(u.id, vague.id);
  expect(await listInbox(u.id, "NEEDS_REVIEW")).toEqual([]);
});

test("the same email delivered twice is processed once", async () => {
  const u = await makeUser();
  const to = await addressFor(u.id);
  const { deps, classify } = harness();
  const e = event(to);
  await ingestEmail(e, deps);
  expect((await ingestEmail({ ...e, emailId: "em_retry" }, deps)).status).toBe("duplicate");
  expect(classify).toHaveBeenCalledTimes(1);
  expect(await db.application.count({ where: { userId: u.id } })).toBe(1);
});

test("unknown or foreign-domain recipients are ignored without any work", async () => {
  const { deps, fetch } = harness();
  expect((await ingestEmail(event("u-abcdefghij@in.landed.test"), deps)).status).toBe("ignored");
  const u = await makeUser();
  const to = await addressFor(u.id);
  expect((await ingestEmail(event(to.replace(DOMAIN, "evil.example")), deps)).status).toBe("ignored");
  expect(fetch).not.toHaveBeenCalled();
});

test("non-job emails are ignored; the Gmail forwarding code is captured without an AI call", async () => {
  const u = await makeUser();
  const to = await addressFor(u.id);
  await ingestEmail(event(to), harness({ kind: "NOT_JOB_RELATED" }).deps);
  expect(await listInbox(u.id, "IGNORED")).toHaveLength(1);
  const { deps, classify } = harness({}, { from: "forwarding-noreply@google.com", subject: "(#123456789) Gmail Forwarding Confirmation - Receive Mail from a@gmail.com" });
  await ingestEmail(event(to, { from: "forwarding-noreply@google.com" }), deps);
  expect(classify).not.toHaveBeenCalled();
  expect((await listInbox(u.id, "IGNORED")).find((e) => e.forwardingCode)?.forwardingCode).toBe("123456789");
});

test("a classifier failure is stored as couldn't-read and can be retried", async () => {
  const u = await makeUser();
  const to = await addressFor(u.id);
  await ingestEmail(event(to), harness(new Error("API down")).deps);
  const [failed] = await listInbox(u.id, "FAILED");
  expect(failed.reviewReason).toBe("Couldn't read this email");
  expect(await inboxBadgeCount(u.id)).toBe(1);
  await retryEmail(u.id, failed.id, harness().deps);
  expect((await listInbox(u.id, "UPDATED"))[0].id).toBe(failed.id);
  expect(await inboxBadgeCount(u.id)).toBe(0);
});

test("a prompt-injected classification only affects the recipient's own board", async () => {
  const a = await makeUser();
  const b = await makeUser();
  const bGoogle = await makeApplication(b.id, { company: "Google", status: "INTERVIEW" });
  await ingestEmail(event(await addressFor(a.id)), harness({ kind: "OFFER", company: "Google", confidence: 1 }).deps);
  expect((await getApplication(b.id, bGoogle.id)).status).toBe("INTERVIEW");
});

test("monthly cap stores further emails as couldn't-read without fetching or classifying", async () => {
  const u = await makeUser();
  const to = await addressFor(u.id);
  await db.inboundEmail.createMany({
    data: Array.from({ length: MONTHLY_EMAILS_PER_USER }, (_, i) => ({
      userId: u.id, providerId: `p${i}`, messageId: `cap-${i}`, fromAddress: "x", subject: "x", receivedAt: new Date(), snippet: "", state: "IGNORED" as const, createdAt: new Date(),
    })),
  });
  const { deps, classify, fetch } = harness();
  await ingestEmail(event(to), deps);
  expect(classify).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
  expect((await listInbox(u.id, "FAILED"))[0].reviewReason).toBe("Monthly limit reached");
});

test("records older than 90 days are deleted", async () => {
  const u = await makeUser();
  const to = await addressFor(u.id);
  await db.inboundEmail.create({
    data: { userId: u.id, providerId: "old", messageId: "old", fromAddress: "x", subject: "x", receivedAt: new Date(), snippet: "", state: "IGNORED", createdAt: new Date(Date.now() - 91 * 24 * 60 * 60_000) },
  });
  await ingestEmail(event(to), harness({ kind: "NOT_JOB_RELATED" }).deps);
  expect(await db.inboundEmail.count({ where: { messageId: "old" } })).toBe(0);
});

test("regenerating the address retires the old one", async () => {
  const u = await makeUser();
  const old = await addressFor(u.id);
  expect(await addressFor(u.id)).toBe(old);
  const fresh = await regenerateInboundAddress(u.id, DOMAIN);
  expect(fresh).not.toBe(old);
  expect((await ingestEmail(event(old), harness().deps)).status).toBe("ignored");
  expect((await ingestEmail(event(fresh), harness().deps)).status).toBe("stored");
});

test("concurrent first visits agree on one address (no overwrite race)", async () => {
  const u = await makeUser();
  const addresses = await Promise.all(Array.from({ length: 5 }, () => getOrCreateInboundAddress(u.id, DOMAIN)));
  expect(new Set(addresses).size).toBe(1);
  expect((await ingestEmail(event(addresses[0]), harness({ kind: "NOT_JOB_RELATED" }).deps)).status).toBe("stored");
});

test("an email forwarded by hand from the user's own Gmail never stamps gmail.com on the application", async () => {
  const u = await makeUser();
  const to = await addressFor(u.id);
  await ingestEmail(event(to, { from: "Me <me@gmail.com>" }), harness({}, { from: "Me <me@gmail.com>" }).deps);
  const [email] = await listInbox(u.id, "UPDATED");
  expect((await getApplication(u.id, email.applicationId!)).companyDomain).toBeNull();
  await ingestEmail(event(to, { from: "Me <me@gmail.com>" }), harness({ kind: "REJECTION", company: "Acme" }, { from: "Me <me@gmail.com>" }).deps);
  expect((await getApplication(u.id, email.applicationId!)).status).toBe("APPLIED");
});

test("one account at its daily limit can't block anyone else's emails", async () => {
  const spammer = await makeUser();
  const other = await makeUser();
  await db.rateLimit.create({ data: { key: `inbound:day:${spammer.id}`, count: DAILY_EMAILS_PER_USER, resetAt: new Date(Date.now() + 60 * 60_000) } });
  const { deps, classify } = harness();
  await ingestEmail(event(await addressFor(spammer.id)), deps);
  expect((await listInbox(spammer.id, "FAILED"))[0].reviewReason).toMatch(/Daily limit/);
  expect(classify).not.toHaveBeenCalled();
  expect((await ingestEmail(event(await addressFor(other.id)), deps)).status).toBe("stored");
  expect(await listInbox(other.id, "UPDATED")).toHaveLength(1);
  const global = await db.rateLimit.findUnique({ where: { key: "inbound:day" } });
  expect(global?.count).toBe(1);
});

test("the app-wide daily cap still applies", async () => {
  const u = await makeUser();
  await db.rateLimit.create({ data: { key: "inbound:day", count: DAILY_EMAILS, resetAt: new Date(Date.now() + 60 * 60_000) } });
  const { deps, classify } = harness();
  await ingestEmail(event(await addressFor(u.id)), deps);
  expect(classify).not.toHaveBeenCalled();
  expect((await listInbox(u.id, "FAILED"))[0].reviewReason).toMatch(/Daily limit/);
});

test("two simultaneous 'Create new application' clicks create one application", async () => {
  const u = await makeUser();
  await ingestEmail(event(await addressFor(u.id)), harness({ kind: "OFFER", company: "Figma", jobTitle: "Designer" }).deps);
  const [email] = await listInbox(u.id, "NEEDS_REVIEW");
  const results = await Promise.allSettled([createFromReview(u.id, email.id), createFromReview(u.id, email.id)]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(await db.application.count({ where: { userId: u.id } })).toBe(1);
});

test("ignoring an email while a slow retry runs wins: the retry doesn't apply its change", async () => {
  const u = await makeUser();
  await ingestEmail(event(await addressFor(u.id)), harness(new Error("API down")).deps);
  const [failed] = await listInbox(u.id, "FAILED");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const slow = harness();
  const classify = slow.deps.classifier.classify;
  slow.deps.classifier = { classify: async (e) => { await gate; return classify(e); } };
  const retrying = retryEmail(u.id, failed.id, slow.deps);
  await new Promise((r) => setTimeout(r, 200));
  await ignoreEmail(u.id, failed.id);
  release();
  await expect(retrying).rejects.toThrow(ReviewError);
  expect((await db.inboundEmail.findUniqueOrThrow({ where: { id: failed.id } })).state).toBe("IGNORED");
  expect(await db.application.count({ where: { userId: u.id } })).toBe(0);
});

test("the same email delivered twice at once is applied once", async () => {
  const u = await makeUser();
  const e = event(await addressFor(u.id));
  const { deps } = harness();
  const results = await Promise.all([ingestEmail(e, deps), ingestEmail({ ...e, emailId: "em_dup" }, deps)]);
  expect(results.map((r) => r.status).sort()).toEqual(["duplicate", "stored"]);
  expect(await db.application.count({ where: { userId: u.id } })).toBe(1);
});

test("undo order: an earlier email can't be undone after a later one; the later one can", async () => {
  const u = await makeUser();
  const a = await makeApplication(u.id, { company: "Stripe", title: "Software Engineer", status: "APPLIED" });
  const to = await addressFor(u.id);
  await ingestEmail(event(to), harness({ kind: "INTERVIEW" }).deps);
  await ingestEmail(event(to), harness({ kind: "OFFER" }).deps);
  const [offer, interview] = await listInbox(u.id, "UPDATED");
  await expect(undoEmail(u.id, interview.id)).rejects.toThrow("Changed since");
  await undoEmail(u.id, offer.id);
  expect((await getApplication(u.id, a.id)).status).toBe("INTERVIEW");
  await undoEmail(u.id, interview.id);
  expect((await getApplication(u.id, a.id)).status).toBe("APPLIED");
});
