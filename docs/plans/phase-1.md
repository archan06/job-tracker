# Phase 1 (MVP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A deployable job application tracker where a signed-in user can create, edit and delete applications, move them across a Kanban board, filter them in a table, and see each one's event history.

**Architecture:** Next.js App Router. Server Components read through service functions in `src/server/services/`; mutations are Server Actions that authenticate, validate with Zod, and call those services. Every service takes the session `userId` and scopes every query by it. Status changes are written as `Event` rows in the same transaction that updates `Application.status`.

**Tech Stack:** Next.js (App Router, TypeScript), Tailwind CSS, `next-themes`, Prisma + PostgreSQL (Neon/Supabase), Auth.js v5 (`next-auth` + `@auth/prisma-adapter`, Credentials + Google), `bcryptjs`, Zod, dnd-kit (`@dnd-kit/core`), Vitest, Playwright.

**Spec:** `docs/spec.md` (read the "Approved Phase 1 decisions" section; it overrides nothing in the brief, it narrows it).

## Global Constraints

- Install the latest stable version of every dependency; follow that major version's conventions. Specifically: on Next.js ≥ 16 the request guard file is `src/proxy.ts`, on ≤ 15 it is `src/middleware.ts`. On Prisma ≥ 7 use `prisma.config.ts` and the `@prisma/adapter-pg` driver adapter.
- Database URL comes only from `DATABASE_URL`. Migrations use `DIRECT_URL` when set (Neon/Supabase pooled URLs can't run migrations), else `DATABASE_URL`.
- No secrets in code. Every env var used appears in `.env.example` with a placeholder and a one-line comment.
- Status enum, in this exact board order: `SAVED, APPLIED, PHONE_SCREEN, INTERVIEW, OFFER, REJECTED, WITHDRAWN`.
- Source enum: `REFERRAL, LINKEDIN, COMPANY_SITE, COLD_APPLY, OTHER`.
- Event type enum: `STATUS_CHANGE, INTERVIEW, EMAIL, NOTE, FOLLOW_UP`.
- Every status change creates exactly one `STATUS_CHANGE` Event. Nothing writes `Application.status` except `src/server/services/applications.ts`.
- No business logic in React components; components call Server Actions or receive data from Server Components.
- Every Server Action starts with `requireUserId()`; every service function takes `userId` as its first argument and filters by it.
- UI: load the `design-taste-frontend` skill before the first UI task (Task 6) and follow it for all UI tasks, with this direction: **simple and clean, not stark minimalism** — soft neutral surfaces, clear hierarchy, comfortable spacing, rounded cards with subtle borders/shadows, one accent color per status. Mobile-first; every page usable at 375px width.
- Light and dark mode: all colors come from CSS variables defined for both themes (no hard-coded light-only colors in components). Theme options Light / Dark / System, default System, stored by `next-themes`; no flash of the wrong theme on load. Text and status colors meet WCAG AA contrast (4.5:1 for body text) in both themes.
- **No commits.** The owner reviews and commits at the end of the phase. Run the listed verification at the end of each task instead.

## Review Focus

1. **Another user's application ID in a URL or action call** → behaves exactly like a nonexistent ID (404 page / `NotFoundError`), never reveals data or existence. Tested in Task 4.
2. **Dropping a card on its current column, double-firing a drop, or a failed save** → no duplicate Event; the card snaps back on failure. Tested in Tasks 4 and 7.
3. **Email case and long passwords**: `Foo@Example.com` and `foo@example.com` are one account; passwords over 72 bytes are rejected (bcrypt silently truncates past 72). Tested in Tasks 2 and 3.
4. **URLs pasted without a protocol** (`boards.greenhouse.io/acme/jobs/1`) → accepted and stored as `https://…`, not rejected. Tested in Task 2.
5. **`dateApplied` shifting by a day across time zones** → stored as a date-only column (`@db.Date`), parsed from `YYYY-MM-DD` as UTC, and formatted with `timeZone: "UTC"`, so a user in California entering Oct 7 sees Oct 7. Tested in Task 2.

---

## File map

```
prisma/schema.prisma            data model (Task 1)
prisma/seed.ts                  demo data (Task 5)
prisma.config.ts                Prisma ≥7 only (Task 1)
src/lib/status.ts               enum order, labels, colors (Task 2)
src/lib/dates.ts                date-only parse/format helpers (Task 2)
src/lib/validation/*.ts         Zod schemas (Task 2)
src/lib/board.ts                pure board grouping/moving (Task 7)
src/lib/table-query.ts          URL params ⇄ filters (Task 8)
src/server/db.ts                Prisma client singleton (Task 1)
src/server/auth.config.ts       edge-safe Auth.js config (Task 3)
src/server/auth.ts              full Auth.js config + requireUserId (Task 3)
src/server/services/errors.ts   NotFoundError, EmailTakenError (Task 3)
src/server/services/users.ts    (Task 3)
src/server/services/applications.ts  (Task 4)
src/server/services/events.ts   (Task 4)
src/server/actions/*.ts         Server Actions (Tasks 3, 6, 7, 9)
src/app/(auth)/…                login, register (Task 3)
src/app/(app)/…                 signed-in pages (Tasks 6–9)
src/components/…                UI by feature (Tasks 6–10)
tests/unit/**                   pure Vitest tests
tests/integration/**            Vitest against TEST_DATABASE_URL
tests/e2e/**                    Playwright (Task 10)
```

---

### Task 1: Scaffold, tooling and database schema

**Files:**
- Create: Next.js app in `~/job-tracker` (keeps existing `docs/`), `prisma/schema.prisma`, `src/server/db.ts`, `vitest.config.ts`, `tests/integration/setup.ts`, `tests/integration/global-setup.ts`, `tests/unit/smoke.test.ts`, `.env.example`
- Modify: `package.json` scripts, `.gitignore` (ensure `.env*` ignored except `.env.example`)

**Interfaces:**
- Produces: `db` (Prisma client singleton, `import { db } from "@/server/db"`); Prisma enums `ApplicationStatus`, `ApplicationSource`, `EventType`; scripts `test`, `test:integration`, `test:e2e`, `db:migrate`, `db:seed`.

- [ ] **Step 1: Check prerequisites**

Run: `node --version` → Expected: `v20.x` or higher. Confirm `.env.local` exists with `DATABASE_URL`, `TEST_DATABASE_URL` (a second database or Neon branch), and `AUTH_SECRET`; if not, stop and ask the owner.

- [ ] **Step 2: Scaffold**

Run: `npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm` in `~/job-tracker`, then `git init` if no `.git`. Install: `prisma @prisma/client zod next-auth@latest @auth/prisma-adapter bcryptjs @dnd-kit/core @dnd-kit/utilities next-themes` and dev deps `vitest @vitest/coverage-v8 vite-tsconfig-paths @playwright/test tsx @types/bcryptjs`.

- [ ] **Step 3: Write `prisma/schema.prisma`**

Decisions the schema must encode (field names exactly as below):

```prisma
enum ApplicationStatus { SAVED APPLIED PHONE_SCREEN INTERVIEW OFFER REJECTED WITHDRAWN }
enum ApplicationSource { REFERRAL LINKEDIN COMPANY_SITE COLD_APPLY OTHER }
enum EventType { STATUS_CHANGE INTERVIEW EMAIL NOTE FOLLOW_UP }

model User {
  id String @id @default(cuid())
  email String @unique          // always stored lowercase
  name String?
  emailVerified DateTime?       // required by Auth.js adapter
  image String?
  passwordHash String?          // null for Google-only users
  createdAt DateTime @default(now())
  accounts Account[]  sessions Session[]  applications Application[]
}

model Application {
  id String @id @default(cuid())
  userId String
  company String
  title String
  url String?
  location String?
  salaryRange String?
  status ApplicationStatus @default(SAVED)
  source ApplicationSource @default(OTHER)
  dateApplied DateTime? @db.Date
  description String?
  notes String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  events Event[]  reminders Reminder[]
  @@index([userId, status])
}

model Event {
  id String @id @default(cuid())
  applicationId String
  type EventType
  fromStatus ApplicationStatus?
  toStatus ApplicationStatus?
  date DateTime @default(now())
  notes String?
  application Application @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  @@index([applicationId, date])
}

model Reminder {
  id String @id @default(cuid())
  applicationId String
  dueAt DateTime
  sent Boolean @default(false)
  application Application @relation(fields: [applicationId], references: [id], onDelete: Cascade)
  @@index([dueAt, sent])
}
```

Plus the standard Auth.js Prisma adapter models `Account`, `Session`, `VerificationToken`, copied from the `@auth/prisma-adapter` docs for the installed version.

- [ ] **Step 4: Migrate**

Run: `npx prisma migrate dev --name init` → Expected: migration created and applied, client generated.

- [ ] **Step 5: `src/server/db.ts`**

Export `db`, a `PrismaClient` cached on `globalThis` in development to survive hot reload.

- [ ] **Step 6: Test setup**

`vitest.config.ts` defines two projects: `unit` (`tests/unit/**/*.test.ts`, node env) and `integration` (`tests/integration/**/*.test.ts`, `fileParallelism: false`, `globalSetup: tests/integration/global-setup.ts`, `setupFiles: tests/integration/setup.ts`). Global setup sets `DATABASE_URL = TEST_DATABASE_URL` and runs `prisma migrate deploy`; refuse to run if `TEST_DATABASE_URL` is missing or equals `DATABASE_URL`. `setup.ts` deletes all rows from `User` in `beforeEach` (cascades remove the rest). Scripts: `"test": "vitest run --project unit"`, `"test:integration": "vitest run --project integration"`, `"test:e2e": "playwright test"`.

- [ ] **Step 7: Smoke test and `.env.example`**

`tests/unit/smoke.test.ts`: `expect(1 + 1).toBe(2)`. `.env.example` lists `DATABASE_URL`, `DIRECT_URL`, `TEST_DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` with placeholder values and comments.

- [ ] **Step 8: Verify**

Run: `npm test && npm run build` → Expected: 1 test passes; build succeeds.

---

### Task 2: Domain constants, date helpers and validation schemas

**Files:**
- Create: `src/lib/status.ts`, `src/lib/dates.ts`, `src/lib/validation/application.ts`, `src/lib/validation/event.ts`, `src/lib/validation/auth.ts`
- Test: `tests/unit/validation.test.ts`, `tests/unit/dates.test.ts`

**Interfaces:**
- Produces:
  - `STATUSES: readonly ApplicationStatus[]` (board order), `STATUS_LABELS: Record<ApplicationStatus, string>` (e.g. `PHONE_SCREEN → "Phone screen"`), `SOURCES`, `SOURCE_LABELS` (`COMPANY_SITE → "Company site"`, `COLD_APPLY → "Cold apply"`, `LINKEDIN → "LinkedIn"`), `USER_EVENT_TYPES = ["NOTE","INTERVIEW","EMAIL","FOLLOW_UP"] as const`.
  - `parseDateOnly(s: string): Date` (UTC midnight; throws on invalid), `formatDateOnly(d: Date): string` (e.g. `"Oct 7, 2026"`, `Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })`), `toDateInputValue(d: Date): string` (`"2026-10-07"`).
  - `applicationInputSchema`, `type ApplicationInput`; `eventInputSchema`, `type EventInput`; `registerSchema`, `type RegisterInput`; `loginSchema`.

- [ ] **Step 1: Write failing tests**

```ts
// tests/unit/validation.test.ts
const base = { company: "Acme", title: "Frontend Engineer" };

test("minimal input gets defaults", () => {
  expect(applicationInputSchema.parse(base)).toMatchObject({ status: "SAVED", source: "OTHER" });
});
test("company and title are required and trimmed", () => {
  expect(applicationInputSchema.safeParse({ company: "  ", title: "x" }).success).toBe(false);
  expect(applicationInputSchema.parse({ company: " Acme ", title: " Dev " })).toMatchObject({ company: "Acme", title: "Dev" });
});
test("url without protocol is normalized to https", () => {
  expect(applicationInputSchema.parse({ ...base, url: "boards.greenhouse.io/acme/jobs/1" }).url)
    .toBe("https://boards.greenhouse.io/acme/jobs/1");
});
test("empty optional strings become undefined", () => {
  const r = applicationInputSchema.parse({ ...base, url: "", location: "", dateApplied: "" });
  expect(r.url).toBeUndefined(); expect(r.location).toBeUndefined(); expect(r.dateApplied).toBeUndefined();
});
test("non-http url is rejected", () => {
  expect(applicationInputSchema.safeParse({ ...base, url: "javascript:alert(1)" }).success).toBe(false);
});
test("dateApplied parses as UTC date", () => {
  expect(applicationInputSchema.parse({ ...base, dateApplied: "2026-10-07" }).dateApplied?.toISOString())
    .toBe("2026-10-07T00:00:00.000Z");
});
test("length limits", () => {
  expect(applicationInputSchema.safeParse({ ...base, company: "a".repeat(101) }).success).toBe(false);
  expect(applicationInputSchema.safeParse({ ...base, notes: "a".repeat(5001) }).success).toBe(false);
});
test("event schema excludes STATUS_CHANGE and requires notes for NOTE", () => {
  expect(eventInputSchema.safeParse({ type: "STATUS_CHANGE", date: "2026-10-07" }).success).toBe(false);
  expect(eventInputSchema.safeParse({ type: "NOTE", date: "2026-10-07", notes: "" }).success).toBe(false);
  expect(eventInputSchema.safeParse({ type: "INTERVIEW", date: "2026-10-07" }).success).toBe(true);
});
test("register lowercases email and bounds password bytes", () => {
  expect(registerSchema.parse({ email: "Foo@Example.com", name: "A", password: "longenough" }).email).toBe("foo@example.com");
  expect(registerSchema.safeParse({ email: "a@b.co", name: "A", password: "short" }).success).toBe(false);
  expect(registerSchema.safeParse({ email: "a@b.co", name: "A", password: "é".repeat(37) }).success).toBe(false); // 74 bytes
});
```

```ts
// tests/unit/dates.test.ts
test("round trip keeps the calendar day", () => {
  expect(toDateInputValue(parseDateOnly("2026-01-31"))).toBe("2026-01-31");
  expect(formatDateOnly(parseDateOnly("2026-10-07"))).toBe("Oct 7, 2026");
});
test("invalid date throws", () => { expect(() => parseDateOnly("2026-02-30")).toThrow(); });
```

- [ ] **Step 2: Run, expect failure**

Run: `npm test` → Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

Limits: `company` 1–100, `title` 1–150, `location` ≤ 100, `salaryRange` ≤ 50, `url` ≤ 2048, `description` ≤ 10000, `notes` ≤ 5000, event `notes` ≤ 5000, `name` 1–100, password 8 chars min and ≤ 72 UTF-8 bytes (`new TextEncoder().encode(p).length`). Schemas accept `FormData`-shaped strings (empty string → `undefined`). `dateApplied`/`date` go through `parseDateOnly`. URL: trim, prefix `https://` when no scheme, then require `http:`/`https:`.

- [ ] **Step 4: Verify**

Run: `npm test` → Expected: all pass.

---

### Task 3: Users and authentication

**Files:**
- Create: `src/server/services/errors.ts`, `src/server/services/users.ts`, `src/server/auth.config.ts`, `src/server/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/proxy.ts` (or `middleware.ts`), `src/server/actions/auth.ts`, `src/app/(auth)/login/page.tsx`, `src/app/(auth)/register/page.tsx`, `src/lib/auth-errors.ts`
- Test: `tests/integration/users.test.ts`, `tests/unit/auth-errors.test.ts`

**Interfaces:**
- Consumes: `registerSchema`, `loginSchema`, `db`.
- Produces:
  - `class NotFoundError extends Error`, `class EmailTakenError extends Error`.
  - `registerUser(input: RegisterInput): Promise<{ id: string; email: string }>`; `verifyCredentials(email: string, password: string): Promise<{ id: string; email: string; name: string | null } | null>`.
  - `auth`, `signIn`, `signOut`, `handlers` from `@/server/auth`; `requireUserId(): Promise<string>` (redirects to `/login` when signed out).
  - `registerAction(prev, formData): Promise<ActionResult>`, `loginAction(prev, formData): Promise<ActionResult>`, `signOutAction(): Promise<void>`.
  - `type ActionResult = { ok: true } | { ok: false; error?: string; fieldErrors?: Record<string, string[]> }` exported from `src/server/actions/types.ts`.
  - `authErrorMessage(code: string | undefined): string | null`.

- [ ] **Step 1: Write failing tests**

```ts
// tests/integration/users.test.ts
test("registers with lowercase email and hashed password", async () => {
  const u = await registerUser({ email: "foo@example.com", name: "Foo", password: "correct-horse" });
  const row = await db.user.findUniqueOrThrow({ where: { id: u.id } });
  expect(row.passwordHash).not.toBe("correct-horse");
});
test("duplicate email in any case throws EmailTakenError", async () => {
  await registerUser({ email: "foo@example.com", name: "Foo", password: "correct-horse" });
  await expect(registerUser({ email: "foo@example.com", name: "X", password: "another-pass" })).rejects.toBeInstanceOf(EmailTakenError);
});
test("verifyCredentials", async () => {
  await registerUser({ email: "foo@example.com", name: "Foo", password: "correct-horse" });
  expect(await verifyCredentials("FOO@example.com", "correct-horse")).toMatchObject({ email: "foo@example.com" });
  expect(await verifyCredentials("foo@example.com", "wrong")).toBeNull();
  expect(await verifyCredentials("nobody@example.com", "correct-horse")).toBeNull();
});
test("Google-only user (no passwordHash) cannot log in with a password", async () => {
  await db.user.create({ data: { email: "g@example.com" } });
  expect(await verifyCredentials("g@example.com", "anything-at-all")).toBeNull();
});
```

```ts
// tests/unit/auth-errors.test.ts
test("maps Auth.js codes", () => {
  expect(authErrorMessage("CredentialsSignin")).toBe("Email or password is incorrect.");
  expect(authErrorMessage("OAuthAccountNotLinked")).toBe("This email is already registered with a password. Sign in with your password instead.");
  expect(authErrorMessage(undefined)).toBeNull();
  expect(authErrorMessage("Weird")).toBe("Something went wrong signing you in. Please try again.");
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npm test && npm run test:integration` → Expected: FAIL.

- [ ] **Step 3: Implement services**

`bcryptjs` cost 12. `verifyCredentials` lowercases the email and still runs a bcrypt compare against a fixed dummy hash when the user is missing (equal timing).

- [ ] **Step 4: Implement Auth.js**

`auth.config.ts`: providers list and `pages: { signIn: "/login" }`, `session: { strategy: "jwt" }`, an `authorized` callback that allows `/login`, `/register`, `/api/auth/*` and requires a session elsewhere. Google is included only when `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` are set; the login page hides the Google button otherwise. `auth.ts` spreads `auth.config.ts`, adds `PrismaAdapter(db)` and the Credentials provider calling `verifyCredentials`, and copies `user.id` into the token (`jwt` callback) and `session.user.id` (`session` callback). The proxy file imports only `auth.config.ts`. Matcher excludes `_next/static`, `_next/image`, `favicon.ico` and public files.

- [ ] **Step 5: Auth pages and actions**

`registerAction` validates, calls `registerUser`, maps `EmailTakenError` to `fieldErrors.email = ["An account with this email already exists."]`, then signs in and redirects to `/board`. `loginAction` calls `signIn("credentials", …)` and redirects to `/board`; failure returns the `authErrorMessage("CredentialsSignin")` text. Login page reads `?error=` and shows `authErrorMessage`. `/` redirects to `/board` when signed in, else `/login`.

- [ ] **Step 6: Verify**

Run: `npm test && npm run test:integration` → Expected: pass. Run `npm run dev`; registering, signing out, and signing in work; visiting `/board` signed out redirects to `/login`.

---

### Task 4: Application and event services

**Files:**
- Create: `src/server/services/applications.ts`, `src/server/services/events.ts`
- Test: `tests/integration/applications.test.ts`, `tests/integration/events.test.ts`, `tests/integration/factories.ts`

**Interfaces:**
- Consumes: `db`, `ApplicationInput`, `EventInput`, `NotFoundError`.
- Produces:
  - `type ApplicationFilters = { statuses?: ApplicationStatus[]; sources?: ApplicationSource[]; company?: string; appliedFrom?: Date; appliedTo?: Date; sort?: "company" | "title" | "status" | "dateApplied" | "updatedAt"; dir?: "asc" | "desc" }`
  - `listApplications(userId: string, filters?: ApplicationFilters): Promise<Application[]>` (default sort `updatedAt desc`; `company` is a case-insensitive contains; date range filters `dateApplied` inclusive).
  - `getApplication(userId: string, id: string): Promise<Application & { events: Event[] }>` (events ordered `date desc, id desc`; throws `NotFoundError`).
  - `createApplication(userId: string, input: ApplicationInput): Promise<Application>`
  - `updateApplication(userId: string, id: string, input: ApplicationInput): Promise<Application>`
  - `changeStatus(userId: string, id: string, toStatus: ApplicationStatus): Promise<Application>`
  - `deleteApplication(userId: string, id: string): Promise<void>`
  - `addEvent(userId: string, applicationId: string, input: EventInput): Promise<Event>`
  - Test factories: `makeUser(email?: string): Promise<User>`, `makeApplication(userId: string, overrides?: Partial<ApplicationInput>): Promise<Application>`.

- [ ] **Step 1: Write failing tests**

```ts
// tests/integration/applications.test.ts
test("create logs an initial STATUS_CHANGE event from null", async () => {
  const u = await makeUser();
  const a = await createApplication(u.id, { company: "Acme", title: "Dev", status: "SAVED", source: "OTHER" });
  const events = await db.event.findMany({ where: { applicationId: a.id } });
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ type: "STATUS_CHANGE", fromStatus: null, toStatus: "SAVED" });
});
test("changeStatus writes one event and updates status", async () => {
  const u = await makeUser(); const a = await makeApplication(u.id);
  await changeStatus(u.id, a.id, "APPLIED");
  const { status, events } = await getApplication(u.id, a.id);
  expect(status).toBe("APPLIED");
  expect(events[0]).toMatchObject({ type: "STATUS_CHANGE", fromStatus: "SAVED", toStatus: "APPLIED" });
});
test("changeStatus to the same status is a no-op", async () => {
  const u = await makeUser(); const a = await makeApplication(u.id);
  await changeStatus(u.id, a.id, "SAVED");
  expect(await db.event.count({ where: { applicationId: a.id } })).toBe(1);
});
test("moving to APPLIED fills empty dateApplied but never overwrites it", async () => {
  const u = await makeUser();
  const a = await makeApplication(u.id);
  expect((await changeStatus(u.id, a.id, "APPLIED")).dateApplied).not.toBeNull();
  const b = await makeApplication(u.id, { dateApplied: parseDateOnly("2026-01-02") });
  expect(toDateInputValue((await changeStatus(u.id, b.id, "APPLIED")).dateApplied!)).toBe("2026-01-02");
});
test("updateApplication with a new status logs exactly one event", async () => {
  const u = await makeUser(); const a = await makeApplication(u.id);
  await updateApplication(u.id, a.id, { company: "Acme", title: "Dev", status: "INTERVIEW", source: "OTHER" });
  expect(await db.event.count({ where: { applicationId: a.id, type: "STATUS_CHANGE" } })).toBe(2);
});
test("other users' applications are not found for every operation", async () => {
  const owner = await makeUser("owner@example.com"); const other = await makeUser("other@example.com");
  const a = await makeApplication(owner.id);
  const input = { company: "X", title: "Y", status: "SAVED", source: "OTHER" } as const;
  await expect(getApplication(other.id, a.id)).rejects.toBeInstanceOf(NotFoundError);
  await expect(updateApplication(other.id, a.id, input)).rejects.toBeInstanceOf(NotFoundError);
  await expect(changeStatus(other.id, a.id, "OFFER")).rejects.toBeInstanceOf(NotFoundError);
  await expect(deleteApplication(other.id, a.id)).rejects.toBeInstanceOf(NotFoundError);
  await expect(addEvent(other.id, a.id, { type: "NOTE", date: new Date(), notes: "x" })).rejects.toBeInstanceOf(NotFoundError);
  expect(await listApplications(other.id)).toEqual([]);
  expect((await getApplication(owner.id, a.id)).status).toBe("SAVED");
});
test("delete removes events", async () => {
  const u = await makeUser(); const a = await makeApplication(u.id);
  await deleteApplication(u.id, a.id);
  expect(await db.event.count({ where: { applicationId: a.id } })).toBe(0);
});
test("listApplications filters", async () => {
  const u = await makeUser();
  await makeApplication(u.id, { company: "Acme Corp", status: "APPLIED", source: "REFERRAL", dateApplied: parseDateOnly("2026-09-01") });
  await makeApplication(u.id, { company: "Globex", status: "SAVED", source: "LINKEDIN" });
  expect((await listApplications(u.id, { company: "acme" })).map(a => a.company)).toEqual(["Acme Corp"]);
  expect(await listApplications(u.id, { statuses: ["SAVED"], sources: ["LINKEDIN"] })).toHaveLength(1);
  expect(await listApplications(u.id, { appliedFrom: parseDateOnly("2026-09-01"), appliedTo: parseDateOnly("2026-09-01") })).toHaveLength(1);
});
```

```ts
// tests/integration/events.test.ts
test("addEvent stores a user event with no status fields", async () => {
  const u = await makeUser(); const a = await makeApplication(u.id);
  const e = await addEvent(u.id, a.id, { type: "INTERVIEW", date: parseDateOnly("2026-10-10"), notes: "Onsite" });
  expect(e).toMatchObject({ type: "INTERVIEW", fromStatus: null, toStatus: null });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npm run test:integration` → Expected: FAIL.

- [ ] **Step 3: Implement**

All writes in `db.$transaction`. Ownership is checked inside the transaction with `findFirst({ where: { id, userId } })`, throwing `NotFoundError` when null. A private `applyStatusChange(tx, app, toStatus)` is the only code that writes `status` and the `STATUS_CHANGE` Event; `changeStatus`, `createApplication` and `updateApplication` all call it. `changeStatus` uses a conditional update (`updateMany where { id, userId, status: currentStatus }`) and skips the Event when 0 rows changed, so two concurrent identical drops produce one Event.

- [ ] **Step 4: Verify**

Run: `npm run test:integration` → Expected: all pass.

---

### Task 5: Seed script

**Files:**
- Create: `prisma/seed.ts`, `src/lib/seed-data.ts`
- Modify: `package.json` (`"db:seed": "tsx prisma/seed.ts"`; Prisma seed config for the installed major)
- Test: `tests/unit/seed-data.test.ts`

**Interfaces:**
- Produces: `statusPath(final: ApplicationStatus, rng: () => number): ApplicationStatus[]`, `mulberry32(seed: number): () => number`.

- [ ] **Step 1: Write failing tests**

```ts
test("paths start at SAVED and end at the final status", () => {
  const rng = mulberry32(1);
  for (const s of STATUSES) {
    const p = statusPath(s, rng);
    expect(p[0]).toBe("SAVED"); expect(p.at(-1)).toBe(s);
  }
});
test("OFFER path passes through every funnel stage in order", () => {
  expect(statusPath("OFFER", mulberry32(1))).toEqual(["SAVED","APPLIED","PHONE_SCREEN","INTERVIEW","OFFER"]);
});
test("REJECTED happens after APPLIED", () => {
  const p = statusPath("REJECTED", mulberry32(7));
  expect(p.indexOf("APPLIED")).toBeGreaterThan(-1); expect(p.indexOf("APPLIED")).toBeLessThan(p.length - 1);
});
```

- [ ] **Step 2: Run, expect failure** — `npm test` → FAIL.

- [ ] **Step 3: Implement**

`statusPath`: funnel `SAVED → APPLIED → PHONE_SCREEN → INTERVIEW → OFFER`; `REJECTED` branches off after a random stage from `APPLIED` to `INTERVIEW`; `WITHDRAWN` after a random stage from `SAVED` to `INTERVIEW`. Seed (uses `mulberry32(42)` so reruns are identical): upserts `demo@example.com` / password `demo-password` with name "Demo User"; deletes that user's applications; creates 30 applications with realistic company/title/location/salary pairs, final-status counts `SAVED 5, APPLIED 9, PHONE_SCREEN 5, INTERVIEW 3, OFFER 1, REJECTED 5, WITHDRAWN 2`, sources spread across all five, first event dates spread over the 56 days before today, 2–9 days between consecutive events, `dateApplied` = date of the `APPLIED` event, plus 1 `INTERVIEW` event on interview-stage apps and a few `NOTE` events. Writes rows directly with `db` (not via services) so event dates are historical. Refuses to run when `NODE_ENV === "production"`.

- [ ] **Step 4: Verify**

Run: `npm test && npm run db:seed && npm run db:seed` → Expected: tests pass; seed runs twice without error; signing in as the demo user shows 30 applications.

---

### Task 6: App shell and application forms

Load the `design-taste-frontend` skill before starting this task.

**Files:**
- Create: `src/app/(app)/layout.tsx` (nav: Board, Applications, New, theme toggle, user menu with sign out; bottom tab bar on mobile), `src/components/theme/theme-provider.tsx`, `src/components/theme/theme-toggle.tsx`, `src/app/(app)/applications/new/page.tsx`, `src/app/(app)/applications/[id]/edit/page.tsx`, `src/components/applications/application-form.tsx`, `src/components/applications/delete-application-button.tsx`, `src/components/ui/*` (button, input, select, textarea, field error, confirm dialog), `src/server/actions/applications.ts`

**Interfaces:**
- Consumes: services from Task 4, `applicationInputSchema`, `ActionResult`, `requireUserId`.
- Produces: `createApplicationAction(prev: ActionResult, formData: FormData): Promise<ActionResult>` (redirects to `/applications/{id}` on success), `updateApplicationAction(id: string, prev: ActionResult, formData: FormData): Promise<ActionResult>`, `deleteApplicationAction(id: string): Promise<ActionResult>` (redirects to `/applications`). All call `revalidatePath("/board")` and `revalidatePath("/applications")`. `NotFoundError` → `notFound()`.
- `<ApplicationForm mode="create" | "edit" initial?={Application} />` — client component using `useActionState`, validates with `applicationInputSchema` before submit, shows field errors from either side, keeps entered values on server error, disables submit while pending.

- `<ThemeToggle />` — a button labeled "Theme" opening a menu with "Light", "Dark", "System" (current one checked). Also shown on the login and register pages.

- [ ] **Step 1: Theme foundation**

Define the color tokens as CSS variables in `src/app/globals.css` for light (`:root`) and dark (`.dark`): `background`, `surface`, `surface-raised`, `border`, `text`, `text-muted`, `primary`, `danger`, and a `status-<name>` + `status-<name>-soft` pair for each of the 7 statuses. Map them into Tailwind's theme so components use `bg-surface`, `text-muted`, etc. Enable class-based dark mode (Tailwind ≥ 4: `@custom-variant dark (&:where(.dark, .dark *));`). Wrap the root layout in `next-themes` `ThemeProvider` with `attribute="class"`, `defaultTheme="system"`, `enableSystem`, `disableTransitionOnChange`; add `suppressHydrationWarning` to `<html>`. Set `color-scheme` per theme so native inputs, date pickers and scrollbars match.

- [ ] **Step 2: Implement actions, form, pages, shell**
- [ ] **Step 3: Verify**

Run: `npm run build` → Expected: succeeds. Manually: switching Light/Dark/System changes the whole app instantly, survives reload with no flash of the other theme, and System follows the OS setting. Create with blank company shows an inline error; create succeeds and lands on the detail route (404 until Task 9 is fine); edit preserves values; delete asks for confirmation; visiting `/applications/<other user's id>/edit` returns 404.

---

### Task 7: Kanban board

**Files:**
- Create: `src/lib/board.ts`, `src/app/(app)/board/page.tsx`, `src/components/board/board.tsx`, `src/components/board/board-column.tsx`, `src/components/board/application-card.tsx`, `src/components/board/status-select.tsx`
- Modify: `src/server/actions/applications.ts`
- Test: `tests/unit/board.test.ts`

**Interfaces:**
- Produces: `type BoardCard = Pick<Application, "id" | "company" | "title" | "location" | "status" | "updatedAt" | "dateApplied">`; `groupByStatus(cards: BoardCard[]): Record<ApplicationStatus, BoardCard[]>` (all 7 keys present, each sorted `updatedAt desc`); `moveCard(groups, id: string, to: ApplicationStatus, now: Date): Record<ApplicationStatus, BoardCard[]>` (pure; returns input unchanged when the card is already in `to` or missing); `changeStatusAction(id: string, status: ApplicationStatus): Promise<ActionResult>`.

- [ ] **Step 1: Write failing tests**

```ts
const c = (id: string, status: ApplicationStatus, t: number) => ({ id, company: "A", title: "T", location: null, dateApplied: null, status, updatedAt: new Date(t) });
test("groups into all seven columns, newest first", () => {
  const g = groupByStatus([c("1","SAVED",1), c("2","SAVED",2), c("3","OFFER",1)]);
  expect(Object.keys(g)).toEqual([...STATUSES]);
  expect(g.SAVED.map(x => x.id)).toEqual(["2","1"]);
  expect(g.REJECTED).toEqual([]);
});
test("moveCard moves to the top of the target column with new status", () => {
  const g = moveCard(groupByStatus([c("1","SAVED",1), c("2","APPLIED",5)]), "1", "APPLIED", new Date(9));
  expect(g.SAVED).toEqual([]); expect(g.APPLIED.map(x => x.id)).toEqual(["1","2"]); expect(g.APPLIED[0].status).toBe("APPLIED");
});
test("moveCard to same column or unknown id returns the same object", () => {
  const g = groupByStatus([c("1","SAVED",1)]);
  expect(moveCard(g, "1", "SAVED", new Date())).toBe(g);
  expect(moveCard(g, "nope", "OFFER", new Date())).toBe(g);
});
```

- [ ] **Step 2: Run, expect failure** — `npm test` → FAIL.

- [ ] **Step 3: Implement**

Page (Server Component) loads `listApplications(userId)` and passes `BoardCard`s to `<Board>`. `<Board>` (client) holds groups in state; on drop or dropdown change it applies `moveCard` immediately, calls `changeStatusAction`, and on `{ ok: false }` restores the previous groups and shows an error toast. Sensors: `PointerSensor` (distance 6px) and `TouchSensor` (delay 250ms, tolerance 5px), `KeyboardSensor`. `DragOverlay` for the dragged card. Columns scroll horizontally with scroll-snap below `md`; card click opens `/applications/{id}`. Empty column shows a muted "No applications" placeholder; a fully empty board shows an empty state with a "Add your first application" link to `/applications/new`.

- [ ] **Step 4: Verify**

Run: `npm test && npm run build` → pass. Manually (seeded data): drag between columns persists after reload and adds one timeline event; dropping in the same column adds none; status dropdown works on a phone-sized viewport.

---

### Task 8: Table view

**Files:**
- Create: `src/lib/table-query.ts`, `src/app/(app)/applications/page.tsx`, `src/components/table/applications-table.tsx`, `src/components/table/table-filters.tsx`
- Test: `tests/unit/table-query.test.ts`

**Interfaces:**
- Consumes: `ApplicationFilters`, `listApplications`.
- Produces: `parseTableQuery(params: Record<string, string | string[] | undefined>): ApplicationFilters`; `toSearchParams(filters: ApplicationFilters): URLSearchParams` (omits defaults).

- [ ] **Step 1: Write failing tests**

```ts
test("defaults", () => { expect(parseTableQuery({})).toEqual({ sort: "updatedAt", dir: "desc" }); });
test("multi-value and comma-separated statuses, invalid values dropped", () => {
  expect(parseTableQuery({ status: ["APPLIED", "BOGUS"], source: "REFERRAL,LINKEDIN" }))
    .toMatchObject({ statuses: ["APPLIED"], sources: ["REFERRAL", "LINKEDIN"] });
});
test("bad sort and bad dates fall back", () => {
  expect(parseTableQuery({ sort: "password", dir: "sideways", from: "nope" })).toEqual({ sort: "updatedAt", dir: "desc" });
});
test("round trip", () => {
  const f = { statuses: ["OFFER"], company: "acme", appliedFrom: parseDateOnly("2026-09-01"), sort: "company", dir: "asc" } as const;
  expect(parseTableQuery(Object.fromEntries(toSearchParams(f)))).toEqual(f);
});
```

- [ ] **Step 2: Run, expect failure** — `npm test` → FAIL.

- [ ] **Step 3: Implement**

URL keys: `status`, `source`, `company`, `from`, `to` (`YYYY-MM-DD`), `sort`, `dir`. Page reads `searchParams`, calls `parseTableQuery` then `listApplications`. Filters are a client component that updates the URL (`router.replace`, company input debounced 300ms) and has a "Clear filters" button. Sortable column headers are links toggling `dir`, with `aria-sort`. Below `md`, rows render as stacked cards. Distinguish "no applications yet" (link to create) from "no matches" (clear filters button).

- [ ] **Step 4: Verify**

Run: `npm test && npm run build` → pass. Manually: filters combine, survive reload, and the back button restores the previous filter state.

---

### Task 9: Detail page and activity timeline

**Files:**
- Create: `src/app/(app)/applications/[id]/page.tsx`, `src/app/(app)/applications/[id]/not-found.tsx`, `src/components/timeline/timeline.tsx`, `src/components/timeline/add-event-form.tsx`, `src/lib/timeline.ts`
- Modify: `src/server/actions/applications.ts`
- Test: `tests/unit/timeline.test.ts`

**Interfaces:**
- Produces: `describeEvent(e: Pick<Event, "type" | "fromStatus" | "toStatus">): string`; `addEventAction(applicationId: string, prev: ActionResult, formData: FormData): Promise<ActionResult>`.

- [ ] **Step 1: Write failing tests**

```ts
test("describes events", () => {
  expect(describeEvent({ type: "STATUS_CHANGE", fromStatus: null, toStatus: "SAVED" })).toBe("Added as Saved");
  expect(describeEvent({ type: "STATUS_CHANGE", fromStatus: "APPLIED", toStatus: "PHONE_SCREEN" })).toBe("Applied → Phone screen");
  expect(describeEvent({ type: "INTERVIEW", fromStatus: null, toStatus: null })).toBe("Interview");
  expect(describeEvent({ type: "FOLLOW_UP", fromStatus: null, toStatus: null })).toBe("Follow-up");
});
```

- [ ] **Step 2: Run, expect failure** — `npm test` → FAIL.

- [ ] **Step 3: Implement**

Detail page shows every Application field (empty ones as "—", URL as an external link with `rel="noopener noreferrer"`, description with preserved line breaks), the status select from Task 7, Edit and Delete buttons, and the timeline (newest first, date via `formatDateOnly`, notes text). Add-event form: type select over `USER_EVENT_TYPES`, date defaulting to today, notes; resets on success. `NotFoundError` → `notFound()`.

- [ ] **Step 4: Verify**

Run: `npm test && npm run build` → pass. Manually: adding a note appears at the top of the timeline without a full reload; changing status on the detail page adds a timeline row.

---

### Task 10: Loading and empty states, mobile pass, end-to-end test, README draft

Load `mobile-native` and `break-ui` skills for this task.

**Files:**
- Create: `src/app/(app)/board/loading.tsx`, `src/app/(app)/applications/loading.tsx`, `src/app/(app)/applications/[id]/loading.tsx` (skeletons matching each layout), `src/app/(app)/error.tsx`, `playwright.config.ts`, `tests/e2e/core-flow.spec.ts`, `README.md`
- Modify: components as needed from the break-ui findings

- [ ] **Step 1: Mobile and worst-case pass**

Check every page at 375px and 1280px, in both light and dark mode (including skeletons, empty states, the drag overlay and the confirm dialog). Apply `mobile-native` fixes (viewport meta, safe-area insets, 16px input font to avoid iOS zoom, tap highlight). Run `break-ui` against the board card, table row and detail page with: a 100-character company name, an unbroken 300-character URL, all optional fields empty, 60 cards in one column. Fix what breaks (truncate with title tooltip, `break-words`, column scroll).

- [ ] **Step 2: Write the e2e test**

`playwright.config.ts` starts `npm run dev` with `DATABASE_URL` set to `TEST_DATABASE_URL`, base URL `http://localhost:3000`, Chromium plus one mobile project (`devices["Pixel 7"]`).

```ts
test("register → create → board → change status → timeline", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  await page.goto("/register");
  await page.getByLabel("Name").fill("E2E"); await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("e2e-password-123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/board/);
  await page.goto("/applications/new");
  await page.getByLabel("Company").fill("Playwright Inc"); await page.getByLabel("Job title").fill("QA Engineer");
  await page.getByRole("button", { name: "Save application" }).click();
  await page.goto("/board");
  const card = page.getByTestId("column-SAVED").getByText("Playwright Inc");
  await expect(card).toBeVisible();
  await page.getByTestId("column-SAVED").getByLabel("Status for Playwright Inc").selectOption("APPLIED");
  await expect(page.getByTestId("column-APPLIED").getByText("Playwright Inc")).toBeVisible();
  await page.getByTestId("column-APPLIED").getByText("Playwright Inc").click();
  await expect(page.getByText("Saved → Applied")).toBeVisible();
});

test("theme choice applies and persists", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/login");
  await page.getByRole("button", { name: "Theme" }).click();
  await page.getByRole("menuitemradio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
});
```

- [ ] **Step 3: Run it**

Run: `npx playwright install chromium && npm run test:e2e` → Expected: passes on both projects.

- [ ] **Step 4: README draft**

Load `stop-slop`. Sections: one-line pitch, features (Phase 1 only, Phase 2–3 listed as "Planned"), screenshots placeholder, tech stack, architecture overview (request → proxy → Server Component/Action → service → Prisma), setup (Node 20+, create Neon DB, copy `.env.example`, `npx prisma migrate dev`, `npm run db:seed`, demo login, `npm run dev`), Google OAuth setup steps, test commands, deploying to Vercel (env vars; `prisma migrate deploy` in the build command), and "Design decisions" covering event-sourced status history (parser fallback section is added in Phase 2).

- [ ] **Step 5: Final verification**

Run: `npm run lint && npm test && npm run test:integration && npm run build && npm run test:e2e` → Expected: all green. Then stop and hand over to the owner for review and commit.
