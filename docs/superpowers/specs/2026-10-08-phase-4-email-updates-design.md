# Phase 4: Board updates from forwarded job emails

Date: 2026-10-08
Status: Approved in conversation (sections 1-3). The user asked to skip the written-review stops.

## Goal

Users forward job emails (application confirmations, interviews, rejections, offers) to a private Landed address. Landed reads each one and updates the board automatically, with an undo, and sends anything it's unsure about to a review Inbox.

## Decisions

| Topic | Decision |
|---|---|
| Email access | Forwarding (a Gmail filter forwards to a private address). No Gmail API: its read scopes are restricted (verification + CASA, 100-user cap until then). |
| Inbound provider | Resend receiving. The domain is `INBOUND_EMAIL_DOMAIN`, either a free `<id>.resend.app` or `in.alexrchan.dev` via an MX record. |
| Automation | Auto-apply with undo. Low-confidence or ambiguous emails go to review. |
| Classifier | Claude Haiku 4.5 (`claude-haiku-4-5`) with structured outputs (`output_config.format`) |

## Data

- `User.inboundToken String? @unique`: 10 random lowercase alphanumerics. The address is `u-<token>@<INBOUND_EMAIL_DOMAIN>`. It's created on first visit to the Email page. Regenerating replaces it, and the old address stops working.
- `InboundEmail` (user cascade, plus `onDelete: SetNull` for the application). Fields:
  - **Identity:** `id`, `userId`, `providerId` (Resend `email_id`), `messageId`, with `@@unique([userId, messageId])`.
  - **Email preview:** `fromAddress`, `subject`, `receivedAt`, `snippet` (first 500 characters of the text), `forwardingCode String?`.
  - **What the classifier said:** `kind` (`APPLICATION_CONFIRMATION | INTERVIEW | REJECTION | OFFER | NOT_JOB_RELATED | GMAIL_FORWARDING_CONFIRMATION`), `confidence Float?`, `company`, `jobTitle`, `companyDomain`, `interviewAt DateTime?`, `summary`.
  - **What Landed did:** `state` (`UPDATED | NEEDS_REVIEW | IGNORED | FAILED | UNDONE`), `reviewReason String?`, `applicationId String?`, `createdApplication Boolean`, `previousStatus ApplicationStatus?`, `previousDateApplied DateTime?`, `appliedStatus ApplicationStatus?`, `eventIds String[]`, `applicationUpdatedAt DateTime?` (a snapshot after the change, used for "changed since").
  - `createdAt`.
- The full email body is never stored. Records older than 90 days are deleted (opportunistically, on each new email).

## Receiving

`POST /api/inbound/resend`:
1. Verify the Standard Webhooks signature (`svix-*` or `webhook-*` headers) with `RESEND_WEBHOOK_SECRET`, using `resend.webhooks.verify`. Invalid → 401.
2. Only `email.received` events are handled. Others → 200 ignored.
3. Recipient: the first `to`/`received_for` address matching `u-<token>@<INBOUND_EMAIL_DOMAIN>` (case-insensitive). No user → 200 ignored.
4. Duplicate `messageId` for that user → 200.
5. Limits: 200 per user per calendar month (UTC), counted from `InboundEmail` rows; `inbound:day` 90 per day app-wide via `rateLimit`. Over a limit → stored as `FAILED` with reason "Monthly limit reached" or "Daily limit reached". No AI call.
6. Fetch content with `resend.emails.receiving.get(email_id)`, then process.

Provider and classifier are injected: `INBOUND_PROVIDER=fake` and `EMAIL_CLASSIFIER=fake` select deterministic fakes for e2e tests.

## Gmail forwarding confirmation

From `forwarding-noreply@google.com`, with a subject containing "Gmail Forwarding Confirmation": pull out the 9-digit confirmation code and store it as `GMAIL_FORWARDING_CONFIRMATION` with `forwardingCode`. No AI call. The Email page shows the latest code.

## Classification

`EmailClassifier.classify({ from, subject, date, text }) → Classification` (zod-validated):

```
kind: APPLICATION_CONFIRMATION | INTERVIEW | REJECTION | OFFER | NOT_JOB_RELATED
confidence: number 0..1
company: string | null
jobTitle: string | null
companyDomain: string | null
interviewAt: ISO datetime | null
summary: string (<= 120 chars)
```

- Text is HTML stripped to plain text, truncated to 12,000 characters.
- The system prompt says the email is untrusted data, not instructions.
- `max_tokens` 1024.
- Any error (API, refusal, parse failure) → `FAILED` "Couldn't read this email", retryable.

## Matching and decision (pure)

**Normalize company names:** lowercase, strip punctuation and the suffixes `inc, llc, ltd, corp, corporation, co, gmbh, plc, limited`, collapse spaces.

**Candidates:** the user's applications whose normalized company equals the email's normalized company, OR whose `companyDomain` equals the sender's registrable domain. The sender's domain is ignored if it's a known ATS or job board (greenhouse.io, greenhouse-mail.io, lever.co, hire.lever.co, myworkday.com, myworkdayjobs.com, ashbyhq.com, smartrecruiters.com, icims.com, jobvite.com, workablemail.com, linkedin.com, indeed.com, bamboohr.com).

**Pick one:** if there's one candidate, use it. If there are several, prefer the one whose normalized title equals the email's title, or contains it, or is contained by it. If it's still ambiguous → review "Several applications match".

| kind | conf < 0.75 | match | no match |
|---|---|---|---|
| NOT_JOB_RELATED | — | IGNORED | IGNORED |
| APPLICATION_CONFIRMATION | REVIEW | SAVED → APPLIED; otherwise log only | CREATE (status APPLIED, `dateApplied` = email date; company and title required, otherwise REVIEW) |
| INTERVIEW | REVIEW | → INTERVIEW (log only if already INTERVIEW). Backwards from OFFER/REJECTED/WITHDRAWN → REVIEW | REVIEW |
| REJECTION | REVIEW | → REJECTED. From OFFER → REVIEW | REVIEW |
| OFFER | REVIEW | → OFFER | REVIEW |

Every UPDATED email adds an `EMAIL` event "From email: <summary>" dated with the email date. INTERVIEW also adds an `INTERVIEW` event dated `interviewAt` (or the email date). A create also sets `companyDomain` when it's valid and not an ATS domain.

## Undo and review

- **Undo:** allowed only if `state = UPDATED` and the application's `updatedAt` equals `applicationUpdatedAt`; otherwise "Changed since: edit it directly". In one transaction:
  - if the email created the application, delete it;
  - otherwise delete the recorded event ids, restore `previousStatus` and `previousDateApplied` (without writing a new status event), and mark the email `UNDONE`.
- **Review actions:**
  - **Apply to application X:** runs the same kind on X, as if it matched.
  - **Create new application:** only for confirmation-like emails with a company and title.
  - **Ignore**
  - **Retry:** for `FAILED` emails. It needs the content again, re-fetched from the provider by `providerId`.
- All actions are scoped to the user, and the 60-per-minute write limit applies.

## UI

`/email` is a nav item ("Email") with a badge counting NEEDS_REVIEW + FAILED. The page has:
- **Setup card:** the address, Copy, the Gmail steps (forwarding plus filter, with the suggested query), the latest forwarding code, Regenerate, and a privacy note.
- **Tabs:** Needs review, Updated, Ignored, Couldn't read. Each row shows from, subject, received time, summary, and the action buttons.

## Environment

`RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`, `INBOUND_EMAIL_DOMAIN`. In tests: `INBOUND_PROVIDER=fake`, `EMAIL_CLASSIFIER=fake`.

## Testing

- **Unit:** address parsing, the forwarding-code extraction, company normalization, ATS domains, title matching, the decision table (every row, plus backwards moves and low confidence), HTML-to-text.
- **Integration** (fake classifier and provider):
  - the webhook signature check, unknown recipients, duplicates, the monthly and daily caps
  - create and update paths and their events
  - undo, including "changed since"
  - review actions
  - cross-user isolation
  - the 90-day cleanup
  - regenerating the address
- **End-to-end:** a signed fake webhook delivers an email, it shows under Updated, Undo works, a review Apply works.
- **Opt-in accuracy eval:** `npm run eval:email`, 25 sample emails against real Haiku.
