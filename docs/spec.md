# Job Application Tracker — Spec

Portfolio project. Built in phases; work stops after each phase for review, testing and a commit by the owner.

## Tech stack
- Next.js (App Router) with TypeScript
- Tailwind CSS for styling
- PostgreSQL with Prisma ORM (free Supabase or Neon database; `DATABASE_URL` env var)
- Auth.js (NextAuth) with email/password and Google sign-in
- dnd-kit for drag-and-drop
- Vitest for unit tests, Playwright for one or two end-to-end tests
- Should deploy cleanly to Vercel

## Data model
- User: id, email, name, createdAt
- Application: id, userId, company, title, url, location, salaryRange, status, source (referral, LinkedIn, company site, cold apply, other), dateApplied, description, notes, createdAt, updatedAt
- Status enum: SAVED, APPLIED, INTERVIEW, OFFER, REJECTED, WITHDRAWN (PHONE_SCREEN removed 2026-10-07; see change log)
- Event: id, applicationId, type (STATUS_CHANGE, INTERVIEW, EMAIL, NOTE, FOLLOW_UP), fromStatus, toStatus, date, notes
- Reminder: id, applicationId, dueAt, sent

Every status change must create an Event row (event-sourced history) instead of only overwriting the status field. Analytics will depend on this.

## Phase 1: MVP
1. Project setup, Prisma schema, migrations, and a seed script with realistic sample data
2. Authentication with protected routes; users can only see their own data
3. Create, edit, and delete applications, with form validation using Zod
4. Kanban board view with one column per status; dragging a card changes its status and logs an Event
5. Table view with sorting and filtering by status, company, source, and date
6. Application detail page showing all fields plus an activity timeline of Events, and a way to add notes or interview events
7. Clean, responsive UI that works on mobile, with loading and empty states

## Phase 2: Smart features
1. URL import: paste a job posting URL and auto-fill the form.
   - Write dedicated parsers for Greenhouse, Lever, and Ashby job boards using their public JSON endpoints
   - For other URLs, fetch the page and extract fields from the HTML (title, company, location, description) as a best effort
   - Always show the extracted fields in an editable form before saving
   - Put parsers in their own module with unit tests against saved fixture files
   - Do not scrape LinkedIn or any site that requires login
2. Duplicate detection: warn if a job with the same normalized URL, or the same company + title, already exists
3. Follow-up reminders: auto-create a reminder 7 days after an application is marked APPLIED, show due reminders on a dashboard, and add an API route that a Vercel cron job can call to process them

## Phase 3: Analytics dashboard
- Totals by status
- Funnel: Applied → Interview → Offer, with conversion rates
- Response rate and average days to first response (computed from Events)
- Breakdown by source showing which sources convert best
- Applications per week over time (use Recharts)

## Code quality requirements
- Consistent folder structure; keep business logic out of React components
- Server-side authorization checks on every query and mutation
- Unit tests for the parsers, the analytics calculations, and duplicate detection
- No secrets in code; provide a .env.example
- A strong README with a feature list, screenshots placeholder, tech stack, architecture overview, setup instructions, and a "Design decisions" section explaining the event-sourced status history and the parser fallback strategy

## Approved Phase 1 decisions (2026-10-07)
- `User.passwordHash` (nullable) added; Auth.js Prisma adapter tables (`Account`, `Session`, `VerificationToken`) added; JWT session strategy (required by the Credentials provider).
- `Event.fromStatus` is nullable; creating an application logs a `STATUS_CHANGE` Event with `fromStatus = null`.
- Deleting an application cascades to its Events and Reminders.
- Indexes on `Application(userId, status)` and `Event(applicationId, date)`.
- `Reminder` table created in Phase 1, unused until Phase 2.
- All status changes go through one service function that updates `Application.status` and writes the Event in one transaction. `Application.status` is a denormalized cache; Events are the source of truth. `dateApplied` is filled when an application first moves to APPLIED and is empty.
- Business logic in `src/server/services/`; every query scoped by the session user's id, so other users' rows read as "not found". Server Actions are thin: auth → Zod → service.
- Route protection in the proxy/middleware is for navigation only; every action and service checks authorization itself.
- Kanban: optimistic move with rollback on failure; touch long-press drag; a per-card status dropdown as the non-drag alternative. Cards sorted by `updatedAt` within a column; no manual ordering (no position field).
- Table filters and sorting live in URL search params and are applied server-side.
- Seed: one demo user, ~30 applications over the past 8 weeks with Event histories consistent with their final status.
- Tests in Phase 1: Vitest for schemas, status-change logic and authorization; one Playwright test (register → create → board → change status via dropdown → timeline).
- UI direction: `design-taste-frontend` skill, steered toward **simple and clean, not stark minimalism**: soft neutral surfaces, clear hierarchy, comfortable spacing, rounded cards with subtle borders/shadows, and color used purposefully (each status has its own accent color). Friendly and easy to scan, not monochrome or austere.
- **Light and dark mode** (added 2026-10-07): a theme toggle with Light / Dark / System options, defaulting to System, remembered per browser, with no flash of the wrong theme on page load. Every screen and every status color must be readable in both themes.
- Project location: `~/job-tracker`.

## Change log
- 2026-10-07: Removed the PHONE_SCREEN status at the owner's request. Migration `20261007200000_remove_phone_screen` moves existing Phone screen applications and history to INTERVIEW and drops the resulting Interview → Interview events. The Phase 3 funnel is now Applied → Interview → Offer, and a "first response" is the first move out of Applied to Interview, Offer or Rejected.
