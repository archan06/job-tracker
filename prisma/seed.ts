import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

import bcrypt from "bcryptjs";
import type { ApplicationSource, ApplicationStatus, EventType } from "../src/generated/prisma/enums";
import { parseDateOnly } from "../src/lib/dates";
import { mulberry32, randInt, statusPath } from "../src/lib/seed-data";

const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "demo-password";
const DAY = 24 * 60 * 60 * 1000;

const JOBS: [company: string, title: string, location: string, salary: string | null, url: string | null][] = [
  ["Stripe", "Frontend Engineer, Dashboard", "Remote (US)", "$165k-$210k", "https://stripe.com/jobs"],
  ["Figma", "Software Engineer, Editor", "San Francisco, CA", "$170k-$230k", "https://www.figma.com/careers/"],
  ["Linear", "Product Engineer", "Remote", null, "https://linear.app/careers"],
  ["Vercel", "Software Engineer, Next.js", "Remote (Americas)", "$160k-$200k", "https://vercel.com/careers"],
  ["Datadog", "Software Engineer, Frontend", "New York, NY", "$150k-$190k", "https://careers.datadoghq.com"],
  ["Airbnb", "Senior Frontend Engineer", "Seattle, WA", "$180k-$240k", "https://careers.airbnb.com"],
  ["Shopify", "Developer, Checkout", "Remote (Canada)", "CA$140k-$175k", "https://www.shopify.com/careers"],
  ["Notion", "Software Engineer, Web", "New York, NY", null, "https://www.notion.so/careers"],
  ["Ramp", "Frontend Engineer", "New York, NY", "$160k-$215k", "https://ramp.com/careers"],
  ["Duolingo", "Software Engineer, Web", "Pittsburgh, PA", "$135k-$170k", "https://careers.duolingo.com"],
  ["Plaid", "Software Engineer, Product", "San Francisco, CA", "$155k-$205k", "https://plaid.com/careers"],
  ["Cloudflare", "Systems Engineer, Dashboard", "Austin, TX", "$140k-$185k", "https://www.cloudflare.com/careers"],
  ["Asana", "Software Engineer, Product", "San Francisco, CA", null, "https://asana.com/jobs"],
  ["Instacart", "Software Engineer II", "Remote (US)", "$145k-$180k", "https://instacart.careers"],
  ["Spotify", "Web Engineer", "New York, NY", "$150k-$195k", "https://www.lifeatspotify.com/jobs"],
  ["GitHub", "Software Engineer II, Projects", "Remote (US)", "$140k-$190k", "https://github.careers"],
  ["Canva", "Frontend Engineer", "Austin, TX", null, "https://www.canva.com/careers"],
  ["Reddit", "Software Engineer, Web Platform", "Remote (US)", "$160k-$210k", null],
  ["Robinhood", "Software Engineer, Web", "Menlo Park, CA", "$150k-$200k", "https://careers.robinhood.com"],
  ["Discord", "Software Engineer, Frontend", "San Francisco, CA", "$170k-$220k", "https://discord.com/careers"],
  ["Zapier", "Frontend Engineer", "Remote", "$130k-$165k", "https://zapier.com/jobs"],
  ["HubSpot", "Software Engineer II", "Cambridge, MA", "$125k-$160k", "https://www.hubspot.com/careers"],
  ["Atlassian", "Frontend Software Engineer", "Remote (US)", null, "https://www.atlassian.com/company/careers"],
  ["Etsy", "Software Engineer, Frontend", "Brooklyn, NY", "$140k-$175k", "https://careers.etsy.com"],
  ["Pinterest", "Software Engineer, Web", "San Francisco, CA", "$155k-$200k", "https://www.pinterestcareers.com"],
  ["Coinbase", "Frontend Engineer", "Remote (US)", "$165k-$195k", "https://www.coinbase.com/careers"],
  ["Squarespace", "Software Engineer, Commerce", "New York, NY", "$135k-$170k", null],
  ["Grammarly", "Software Engineer, Web", "Remote (US)", "$150k-$185k", "https://www.grammarly.com/jobs"],
  ["Webflow", "Senior Software Engineer", "Remote (US)", "$160k-$205k", "https://webflow.com/careers"],
  ["Brex", "Software Engineer, Product", "Remote (US)", null, "https://www.brex.com/careers"],
];

const FINAL_STATUSES: ApplicationStatus[] = [
  ...Array<ApplicationStatus>(5).fill("SAVED"),
  ...Array<ApplicationStatus>(11).fill("APPLIED"),
  ...Array<ApplicationStatus>(6).fill("INTERVIEW"),
  "OFFER",
  ...Array<ApplicationStatus>(5).fill("REJECTED"),
  ...Array<ApplicationStatus>(2).fill("WITHDRAWN"),
];

const SOURCES: ApplicationSource[] = ["REFERRAL", "LINKEDIN", "COMPANY_SITE", "COLD_APPLY", "OTHER"];

const NOTES = [
  "Recruiter said the team is hiring two engineers this quarter.",
  "Ask about on-call expectations in the next call.",
  "Take-home is a small React app, 3 hours suggested.",
  "Hiring manager used to work on the design system team.",
  "Follow up if no reply by Friday.",
  "They use Next.js and Postgres, good overlap.",
];

const DESCRIPTION =
  "Build and maintain customer-facing web features. Work closely with design and product. " +
  "Strong TypeScript and React experience expected; familiarity with accessibility and performance a plus.";

type SeedEvent = { type: EventType; fromStatus?: ApplicationStatus | null; toStatus?: ApplicationStatus; date: Date; notes?: string };

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed in production");
  const { db } = await import("../src/server/db");
  const rng = mulberry32(42);
  const now = Date.now();

  const user = await db.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: { email: DEMO_EMAIL, name: "Demo User", passwordHash: await bcrypt.hash(DEMO_PASSWORD, 12) },
  });
  await db.application.deleteMany({ where: { userId: user.id } });

  for (const [i, [company, title, location, salaryRange, url]] of JOBS.entries()) {
    const final = FINAL_STATUSES[i];
    const path = statusPath(final, rng);
    const gaps = path.slice(1).map(() => randInt(rng, 2, 9));
    const span = gaps.reduce((a, b) => a + b, 0);
    let t = now - (span + randInt(rng, 0, Math.max(0, 56 - span))) * DAY - randInt(rng, 0, 8) * 60 * 60 * 1000;

    const events: SeedEvent[] = [{ type: "STATUS_CHANGE", fromStatus: null, toStatus: "SAVED", date: new Date(t) }];
    let dateApplied: Date | null = null;
    path.slice(1).forEach((status, step) => {
      t = Math.min(t + gaps[step] * DAY, now - 60 * 60 * 1000);
      events.push({ type: "STATUS_CHANGE", fromStatus: path[step], toStatus: status, date: new Date(t) });
      if (status === "APPLIED") dateApplied = parseDateOnly(new Date(t).toISOString().slice(0, 10));
      if (status === "INTERVIEW") {
        events.push({ type: "EMAIL", date: new Date(t), notes: "Recruiter reached out to schedule a 30 minute call." });
        events.push({ type: "INTERVIEW", date: new Date(Math.min(t + 2 * DAY, now)), notes: "Panel with two engineers and the hiring manager." });
      }
    });
    if (rng() < 0.3) events.push({ type: "NOTE", date: new Date(t), notes: NOTES[randInt(rng, 0, NOTES.length - 1)] });

    const lastDate = events.reduce((max, e) => (e.date > max ? e.date : max), events[0].date);
    await db.application.create({
      data: {
        userId: user.id,
        company,
        title,
        location,
        salaryRange,
        url,
        status: final,
        source: SOURCES[randInt(rng, 0, SOURCES.length - 1)],
        dateApplied,
        description: DESCRIPTION,
        createdAt: events[0].date,
        updatedAt: lastDate,
        // Event dates are calendar days; the exact moment goes in createdAt to keep same-day order.
        events: {
          create: events.map((e) => ({ ...e, date: parseDateOnly(e.date.toISOString().slice(0, 10)), createdAt: e.date })),
        },
      },
    });
  }

  console.log(`Seeded ${JOBS.length} applications for ${DEMO_EMAIL} (password: ${DEMO_PASSWORD})`);
  await db.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
