# Landed

Track every job application from the posting you saved to the offer you signed. Drag cards across a Kanban board, filter a sortable table, and see each application's full history on one page.

<!-- Screenshots: board (light), board (dark), application detail, mobile board -->
| Board | Detail | Mobile |
| --- | --- | --- |
| _screenshot coming soon_ | _screenshot coming soon_ | _screenshot coming soon_ |

## Features

**Phase 1 (done)**

- Email/password sign-in, plus Google sign-in when you configure OAuth credentials. Each user sees only their own data.
- Create, edit and delete applications. The same Zod schemas check the form in the browser and again on the server.
- A Kanban board with one column per status. Drag a card with a mouse, press and hold on a touch screen, or use the keyboard (Space, arrow keys, Space). Every card also has a status menu.
- A table you can sort by company, role, status, date applied or last update, and filter by status, company, source and date range. Filters live in the URL, so reload and the back button keep them.
- A detail page with every field and an activity timeline. Add notes, interviews, emails and follow-ups as they happen.
- Light, dark and system themes, with WCAG AA contrast in both.
- Layouts for phones and desktops, with loading skeletons and empty states.

**Planned**

- Phase 2: paste a job posting URL to fill in the form (Greenhouse, Lever and Ashby parsers with an HTML fallback), duplicate warnings, and follow-up reminders on a Vercel cron.
- Phase 3: an analytics dashboard with a status funnel, response rates, days to first response, a source breakdown and applications per week.

## Tech stack

| Area | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Server Components, Server Actions, Cache Components) with TypeScript |
| Styling | Tailwind CSS 4 with CSS-variable color tokens, `next-themes`, Phosphor icons, Geist |
| Database | PostgreSQL on Neon, through Prisma 7 and the `pg` driver adapter |
| Auth | Auth.js v5 (Credentials + Google) with the Prisma adapter and JWT sessions |
| Drag and drop | dnd-kit |
| Validation | Zod 4 |
| Tests | Vitest (unit + integration against a real Postgres), Playwright (end to end, desktop and mobile) |
| Hosting | Vercel |

## Architecture

```
Browser
  │
  ├─ src/proxy.ts                  redirects signed-out visitors to /login (navigation only)
  │
  ├─ src/app/**/page.tsx           Server Components read data through services
  ├─ src/server/actions/*.ts       Server Actions: check the session, validate with Zod, call a service
  │
  ├─ src/server/services/*.ts      all business logic; every query filters by the signed-in user's id
  │
  └─ src/server/db.ts → Prisma → Postgres
```

- `src/lib` holds code with no server or React dependencies: status labels, date helpers, Zod schemas, board grouping and URL filter parsing. Unit tests cover all of it.
- `src/components` holds UI only. Components never query the database or decide business rules.
- Pages and actions call `requireUserId()` themselves. The proxy is a convenience for navigation, not the security boundary.
- A request for another user's application looks the same as a request for one that doesn't exist. Services throw `NotFoundError` in both cases, so nobody can probe for IDs.

## Design decisions

### Status history is event-sourced

Every status change writes an `Event` row (`fromStatus`, `toStatus`, `date`). `Application.status` is a cached copy for fast reads; the events are the record.

- One function, `applyStatusChange` in `src/server/services/applications.ts`, writes both the new status and its event inside a single database transaction. The board, the edit form and the detail page all go through it, so the two can't drift apart.
- Creating an application logs an event with no `fromStatus`. Without it, the funnel analytics planned for Phase 3 would have no starting point for each application.
- The status update is conditional (`WHERE status = <current>`). If two identical moves race each other, one updates the row and logs the event and the other does nothing. An integration test fires two at once and asserts a single event.
- Moving to Applied fills in `dateApplied` if it's empty and never overwrites a date you entered.

With the full history stored, Phase 3 can compute response rates and time to first response from real transitions, without guessing from the current status.

### Dates without a time are stored as dates

`dateApplied` is a Postgres `DATE`. The app parses `YYYY-MM-DD` as UTC midnight and formats it in UTC, so a date you enter in California doesn't show up as the day before.

### Forms keep your input when the server says no

React 19 resets a form after a `<form action>` submission, which would wipe what you typed when validation fails. The forms submit through `onSubmit` and a transition instead (`src/components/forms/use-form-action.ts`), check the Zod schema in the browser first, and clear a field's error as soon as you edit it.

### Job posting parser fallback

Phase 2 will add dedicated parsers for Greenhouse, Lever and Ashby, which publish job data as JSON, with best-effort HTML extraction for other sites. You'll always review the extracted fields before saving. This section will describe that strategy once it ships.

## Security

| Risk | Protection |
| --- | --- |
| Seeing another user's data | Every service query filters by the signed-in user's id; another user's record looks exactly like a missing one. Integration tests cover each operation. |
| Password guessing | 10 sign-in attempts per account and 50 per network every 15 minutes, enforced inside the Auth.js credentials check so direct POSTs to Auth.js can't skip it. |
| Scripted sign-ups and floods | 5 sign-ups per network per hour, 60 changes per account per minute, and a cap of 5,000 applications per account. |
| Stored passwords | bcrypt (cost 12); passwords over bcrypt's 72-byte limit are rejected at sign-up; unknown emails take the same time to check. |
| Passwords in URLs | Forms submit with POST and stay disabled until the page is interactive, so an early submit can't leak fields into the address bar. |
| Session theft | HTTP-only, signed session cookies that expire after 7 days. |
| Clickjacking and injected content | Content-Security-Policy with `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`, a strict referrer policy and HSTS. React escapes all user text and links only allow `http`/`https`. |
| Database injection | All queries go through Prisma; the one raw query (the rate limiter) uses bound parameters. |

Rate-limit counters live in Postgres (`RateLimit` table) so they hold across serverless instances. Limits keyed by network read `x-real-ip`, which Vercel sets itself; on other hosts, put the app behind a proxy that overwrites that header.

Not built yet: password reset, email verification and account deletion.

## Getting started

You need Node.js 20 or newer and a Postgres database. Neon's free tier works well, and its branches give you a separate test database for free.

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy the example environment file and fill it in:
   ```bash
   cp .env.example .env.local
   ```
   | Variable | What to put there |
   | --- | --- |
   | `DATABASE_URL` | Neon connection string with pooling on (host contains `-pooler`) |
   | `DIRECT_URL` | The same string with pooling off. Prisma uses it for migrations. |
   | `TEST_DATABASE_URL` | A second database, such as a Neon branch named `test`. Tests delete its data. |
   | `AUTH_SECRET` | Output of `openssl rand -base64 32` |
   | `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Optional. Leave empty to use email/password only. |
   | `LOGO_DEV_SECRET_KEY`, `NEXT_PUBLIC_LOGO_DEV_PUBLISHABLE_KEY` | Optional. Company suggestions and logos. See below. |
   | `GEOAPIFY_API_KEY` | Optional. City suggestions. See below. |
3. Create the tables and load demo data:
   ```bash
   npx prisma migrate dev
   npm run db:seed
   ```
4. Start the app and sign in as `demo@example.com` with password `demo-password`:
   ```bash
   npm run dev
   ```

### Google sign-in

In Google Cloud Console, create an OAuth client of type "Web application" and add these redirect URIs:

- `http://localhost:3000/api/auth/callback/google`
- `https://<your-domain>/api/auth/callback/google`

Put the client ID and secret in `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`. The Google button appears on the sign-in page once both are set. If someone signs in with Google using an email that already has a password account, the app asks them to use their password instead of silently linking the accounts.

### Company and city suggestions

Company suggestions and logos come from [Logo.dev](https://www.logo.dev) and city suggestions from [Geoapify](https://www.geoapify.com). Both have free plans. From your Logo.dev dashboard, copy the secret key (`sk_...`) into `LOGO_DEV_SECRET_KEY` and the publishable key (`pk_...`) into `NEXT_PUBLIC_LOGO_DEV_PUBLISHABLE_KEY`. Create a Geoapify project and copy its API key into `GEOAPIFY_API_KEY`. All three are optional: without them the fields still work as plain text, past companies are still suggested, and every company shows an initials avatar.

### Connecting Claude or ChatGPT

Landed is an MCP server with its own OAuth 2.1 sign-in, so Claude and ChatGPT can read, add and update a user's applications (never delete). Each user connects with the address `https://<your-domain>/api/mcp`:

- **Claude:** Settings → Connectors → Add custom connector.
- **ChatGPT:** turn on Developer mode (paid plans), then add a connector.

They sign in to Landed, review what the app can do, and click Allow. Connections can be removed anytime under the account menu → **Connected apps**. Supports Client ID Metadata Documents and Dynamic Client Registration, PKCE (S256), rotating refresh tokens and per-tool scopes (`applications:read`, `applications:write`).

## Testing

| Command | What it runs |
| --- | --- |
| `npm test` | Unit tests for validation, dates, board logic, URL filters, timeline text and seed data |
| `npm run test:integration` | Service tests against `TEST_DATABASE_URL`: status history, authorization between users, filters |
| `npm run test:e2e` | Playwright on desktop Chrome and a Pixel 7 viewport: register, create, move on the board, check the timeline, switch themes |
| `npm run db:seed:worst` | Loads stress-test data (longest allowed names, unbroken URLs, right-to-left text, 60-card column). Sign in as `worst@example.com` / `worst-case-password`. |

Integration and end-to-end tests refuse to run if `TEST_DATABASE_URL` is missing or matches `DATABASE_URL`.

## Deploying to Vercel

1. Import the repository into Vercel.
2. Add `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, the suggestion keys (`LOGO_DEV_SECRET_KEY`, `NEXT_PUBLIC_LOGO_DEV_PUBLISHABLE_KEY`, `GEOAPIFY_API_KEY`) and, if you use Google sign-in, `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`.
3. Set the build command to apply migrations before building:
   ```bash
   npx prisma migrate deploy && npm run build
   ```
   `npm run build` already runs `prisma generate`.

Hosting somewhere other than Vercel, or running `npm start` locally? Also set `AUTH_TRUST_HOST=true`. Vercel sets the equivalent automatically; elsewhere Auth.js rejects sign-in requests without it.
