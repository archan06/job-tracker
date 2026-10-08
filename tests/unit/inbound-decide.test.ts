import { expect, test } from "vitest";
import { decideEmail, type Candidate, type Classification } from "@/lib/inbound/decide";

const base: Classification = {
  kind: "APPLICATION_CONFIRMATION",
  confidence: 0.95,
  company: "Stripe, Inc.",
  jobTitle: "Software Engineer",
  companyDomain: null,
  interviewAt: null,
  summary: "Thanks for applying",
};
const app = (o: Partial<Candidate> = {}): Candidate => ({
  id: "a1", company: "Stripe", companyDomain: null, title: "Software Engineer", status: "SAVED", ...o,
});
const c = (o: Partial<Classification>) => ({ ...base, ...o });

test("not job related is ignored", () => {
  expect(decideEmail(c({ kind: "NOT_JOB_RELATED" }), [app()], null)).toEqual({ kind: "IGNORE" });
});

test("low confidence always goes to review", () => {
  expect(decideEmail(c({ confidence: 0.6 }), [app()], null)).toMatchObject({ kind: "REVIEW" });
  expect(decideEmail(c({ kind: "OFFER", confidence: 0.74 }), [app()], null)).toMatchObject({ kind: "REVIEW" });
});

test("confirmation: Saved moves to Applied; later stages are only logged", () => {
  expect(decideEmail(base, [app()], null)).toEqual({ kind: "UPDATE", applicationId: "a1", toStatus: "APPLIED", addInterview: false });
  expect(decideEmail(base, [app({ status: "INTERVIEW" })], null)).toEqual({ kind: "UPDATE", applicationId: "a1", toStatus: null, addInterview: false });
});

test("confirmation with no match creates an application, if company and title are known", () => {
  expect(decideEmail(base, [], null)).toEqual({ kind: "CREATE" });
  expect(decideEmail(c({ jobTitle: null }), [], null)).toMatchObject({ kind: "REVIEW" });
  expect(decideEmail(c({ company: null }), [], null)).toMatchObject({ kind: "REVIEW" });
});

test("interview moves forward and logs an interview; backwards needs review", () => {
  const interview = c({ kind: "INTERVIEW" });
  expect(decideEmail(interview, [app({ status: "APPLIED" })], null)).toEqual({ kind: "UPDATE", applicationId: "a1", toStatus: "INTERVIEW", addInterview: true });
  expect(decideEmail(interview, [app({ status: "INTERVIEW" })], null)).toEqual({ kind: "UPDATE", applicationId: "a1", toStatus: null, addInterview: true });
  for (const status of ["OFFER", "REJECTED", "WITHDRAWN"] as const) {
    expect(decideEmail(interview, [app({ status })], null)).toMatchObject({ kind: "REVIEW" });
  }
  expect(decideEmail(interview, [], null)).toMatchObject({ kind: "REVIEW" });
});

test("rejection moves to Rejected, except from an offer", () => {
  const rejection = c({ kind: "REJECTION" });
  expect(decideEmail(rejection, [app({ status: "INTERVIEW" })], null)).toEqual({ kind: "UPDATE", applicationId: "a1", toStatus: "REJECTED", addInterview: false });
  expect(decideEmail(rejection, [app({ status: "OFFER" })], null)).toMatchObject({ kind: "REVIEW" });
  expect(decideEmail(rejection, [], null)).toMatchObject({ kind: "REVIEW" });
});

test("offer moves to Offer; no match needs review", () => {
  expect(decideEmail(c({ kind: "OFFER" }), [app({ status: "INTERVIEW" })], null)).toEqual({ kind: "UPDATE", applicationId: "a1", toStatus: "OFFER", addInterview: false });
  expect(decideEmail(c({ kind: "OFFER" }), [], null)).toMatchObject({ kind: "REVIEW" });
});

test("matches by normalized company name or by the sender's domain", () => {
  const byName = decideEmail(c({ kind: "OFFER", company: "STRIPE INC" }), [app({ status: "INTERVIEW" }), app({ id: "b", company: "Acme" })], null);
  expect(byName).toMatchObject({ applicationId: "a1" });
  const byDomain = decideEmail(c({ kind: "OFFER", company: "Stripe Payments" }), [app({ id: "d", company: "Stripe", companyDomain: "stripe.com", status: "INTERVIEW" })], "stripe.com");
  expect(byDomain).toMatchObject({ applicationId: "d" });
});

test("several applications at one company are told apart by title, or sent to review", () => {
  const apps = [app({ id: "be", title: "Backend Engineer", status: "APPLIED" }), app({ id: "fe", title: "Frontend Engineer", status: "APPLIED" })];
  expect(decideEmail(c({ kind: "REJECTION", jobTitle: "Frontend Engineer" }), apps, null)).toMatchObject({ applicationId: "fe" });
  expect(decideEmail(c({ kind: "REJECTION", jobTitle: "Senior Frontend Engineer (Remote)" }), apps, null)).toMatchObject({ applicationId: "fe" });
  expect(decideEmail(c({ kind: "REJECTION", jobTitle: null }), apps, null)).toMatchObject({ kind: "REVIEW", reason: expect.stringMatching(/Several/) });
});

test("other users' applications can't match: decide only ever sees what it is given", () => {
  expect(decideEmail(c({ kind: "OFFER", company: "Nobody" }), [app()], null)).toMatchObject({ kind: "REVIEW" });
});
