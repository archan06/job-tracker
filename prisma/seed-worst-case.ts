// Stress-test data: realistic values at the schema's real limits, to check layouts don't break.
// Usage: npm run db:seed:worst  (sign in as worst@example.com / worst-case-password)
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

import bcrypt from "bcryptjs";
import type { ApplicationStatus } from "../src/generated/prisma/enums";
import { parseDateOnly } from "../src/lib/dates";

const EMAIL = "worst@example.com";
const PASSWORD = "worst-case-password";

// Lengths match the Zod limits: company 100, title 150, location 100, salary 50, url 2048.
const LONGEST_COMPANY = "Northwind Industries Holdings Global Technology & Professional Services (North America) Group, LLC";
const LONG_TITLE =
  "Senior Staff Software Engineer, Frontend Platform, Developer Experience and Design Systems Infrastructure (Remote, US or Canada, Hybrid Optional)";
const LONG_URL =
  "https://boards.greenhouse.io/northwindindustriesholdingsglobaltechnology/jobs/7183920401?gh_src=8c1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c&utm_source=linkedin&utm_medium=jobs&utm_campaign=frontend-platform-engineering-q4-2026-north-america-hiring-push&ref=careers-page-search-results";
const UNBROKEN_NOTE = `Referral link from Aleksandra: ${LONG_URL}`;

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed in production");
  const { db } = await import("../src/server/db");
  const user = await db.user.upsert({
    where: { email: EMAIL },
    update: {},
    create: { email: EMAIL, name: "Aleksandra Wiśniewska-Kowalczyk", passwordHash: await bcrypt.hash(PASSWORD, 12) },
  });
  await db.application.deleteMany({ where: { userId: user.id } });

  const rows: { company: string; title: string; status: ApplicationStatus; extra?: Record<string, unknown> }[] = [
    { company: LONGEST_COMPANY, title: LONG_TITLE, status: "SAVED", extra: { location: "Remote (United States, Canada, Mexico, Brazil, Argentina, Colombia, Chile, Peru)", salaryRange: "US$185,000-US$240,000 base + equity + annual bonus", url: LONG_URL, notes: UNBROKEN_NOTE } },
    { company: "X", title: "Engineer", status: "SAVED" },
    { company: "مايكروسوفت العربية", title: "مهندس برمجيات أول", status: "APPLIED", extra: { location: "دبي، الإمارات العربية المتحدة", dateApplied: parseDateOnly("2026-09-30") } },
    { company: "Nguyễn Thị Phương Thảo Studio", title: "Kỹ sư phần mềm Frontend", status: "INTERVIEW", extra: { location: "Thành phố Hồ Chí Minh" } },
    { company: "Stripe 🚀", title: "Software Engineer", status: "INTERVIEW", extra: { dateApplied: parseDateOnly("2026-01-01") } },
    { company: "Supercalifragilisticexpialidociousandsomeotherwordsthatneverbreak Corporation", title: "Frontend", status: "OFFER" },
    { company: "Globex", title: LONG_TITLE, status: "REJECTED", extra: { description: Array.from({ length: 40 }, (_, i) => `Responsibility ${i + 1}: build, test and ship accessible interfaces used by millions of people.`).join("\n") } },
    { company: "Initech", title: "Software Engineer", status: "WITHDRAWN" },
  ];
  // A column long enough to scroll: 60 saved jobs.
  for (let i = 1; i <= 60; i++) rows.push({ company: `Backlog Company ${i}`, title: "Software Engineer", status: "SAVED" });

  for (const row of rows) {
    const app = await db.application.create({
      data: { userId: user.id, company: row.company, title: row.title, status: row.status, ...(row.extra ?? {}) },
    });
    await db.event.create({ data: { applicationId: app.id, type: "STATUS_CHANGE", fromStatus: null, toStatus: row.status } });
  }

  // A long timeline on the first application.
  const first = await db.application.findFirstOrThrow({ where: { userId: user.id, company: LONGEST_COMPANY } });
  for (let i = 0; i < 40; i++) {
    await db.event.create({
      data: { applicationId: first.id, type: i % 2 ? "NOTE" : "EMAIL", date: new Date(Date.now() - i * 86_400_000), notes: i === 0 ? UNBROKEN_NOTE : `Follow-up ${i}` },
    });
  }
  console.log(`Seeded ${rows.length} worst-case applications for ${EMAIL} (password: ${PASSWORD})`);
  await db.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
