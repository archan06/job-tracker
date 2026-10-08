const SUFFIXES = new Set(["inc", "llc", "ltd", "corp", "corporation", "co", "gmbh", "plc", "limited"]);

/** "Stripe, Inc." → "stripe": what two mentions of the same company have in common. */
export function normalizeCompany(name: string): string {
  const words = name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").filter(Boolean);
  while (words.length > 1 && SUFFIXES.has(words.at(-1)!)) words.pop();
  return words.join(" ");
}

/** Applicant-tracking systems and job boards: their sender domain says nothing about the employer. */
const ATS_DOMAINS = new Set([
  "greenhouse.io", "greenhouse-mail.io", "lever.co", "myworkday.com", "myworkdayjobs.com", "ashbyhq.com",
  "smartrecruiters.com", "icims.com", "jobvite.com", "workablemail.com", "workable.com", "linkedin.com",
  "indeed.com", "bamboohr.com", "successfactors.com", "taleo.net", "breezy.hr", "recruitee.com", "teamtailor.com",
]);

export const isAtsDomain = (domain: string) => ATS_DOMAINS.has(domain.toLowerCase());

// Second-level labels under which registrations sit one level deeper (acme.co.uk).
const SECOND_LEVEL = new Set(["co", "com", "org", "net", "ac", "gov", "edu"]);

/** The employer's registrable domain from a From header ("jobs@mail.stripe.com" → "stripe.com"), or null for job boards. */
export function senderDomain(from: string): string | null {
  const host = from.match(/@([a-z0-9.-]+\.[a-z]{2,})>?\s*$/i)?.[1]?.toLowerCase();
  if (!host) return null;
  const labels = host.split(".");
  const take = labels.length >= 3 && SECOND_LEVEL.has(labels.at(-2)!) && labels.at(-1)!.length === 2 ? 3 : 2;
  const domain = labels.slice(-take).join(".");
  return isAtsDomain(domain) ? null : domain;
}
