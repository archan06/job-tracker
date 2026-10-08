# Email Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Password accounts must click an emailed link before they can sign in.

**Architecture:** A hashed, 24-hour token per link in a new table; a small `EmailSender` (Resend / fake outbox / console) in `src/server/mail/`; enforcement at one choke point, the Auth.js `session` callback, which only exposes `user.id` when the JWT says `verified`. Every existing guard (`requireUserId`, the proxy, the suggest routes, OAuth authorize) already keys off `session.user.id`.

**Tech Stack:** Next.js 16 App Router, Auth.js v5 (JWT sessions), Prisma 7 + Neon, Resend SDK 6, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-08-email-verification-design.md`

## Global Constraints

- Links expire after **24 hours**; a link keeps working until it expires (it is not single-use).
- Unverified accounts created by sign-up from now on are deleted **7 days** after sign-up (`unverifiedExpiresAt`); accounts that existed before are never auto-deleted or replaced.
- Token: 32 random bytes, base64url, in the link; only its SHA-256 (hex) is stored.
- Send limits: **3 per account per hour**, **10 per network per hour**. Resend button disabled **60 seconds** after each click.
- Sender: `EMAIL_FROM`, default `Landed <noreply@in.alexrchan.dev>`. Links from `APP_URL` → `https://${VERCEL_PROJECT_PRODUCTION_URL}` → `http://localhost:3000`; never the Host header.
- Copy (exact): "Check your inbox", "Email verified. Sign in to continue.", "Verify your email first", "This link has expired", "If that account needs verifying, we've sent a new link", "Sign-up is temporarily unavailable".
- Read `node_modules/next/dist/docs/` before writing Next.js code (AGENTS.md). Migrations: `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` into a new folder, then `migrate deploy` (never `migrate dev`).
- Never run integration or e2e tests against `DATABASE_URL`.

## Review Focus

1. A JWT minted before this change (no `verified` claim) must behave as signed out everywhere, including Server Actions, not just page loads. → Task 4 unit test on the `session` callback.
2. Login form for an unverified account must not send email when the password is wrong. → Task 3 integration test.
3. Sign-up with the address of a **pre-change** unverified account must answer "already taken" and leave its password untouched. → Task 3 integration test.
4. Email scanners pre-opening the link: a second visit with the same link still says verified. → Task 3 integration test.
5. The security e2e flood test expects 5 sign-ups per hour per network; sign-up now ends on `/check-email` instead of `/board`. → Task 6 updates it.

---

### Task 1: Schema, migration and token helpers

**Files:**
- Modify: `prisma/schema.prisma` (User: `unverifiedExpiresAt DateTime?`, `verificationTokens EmailVerificationToken[]`; new model)
- Create: `prisma/migrations/<timestamp>_email_verification/migration.sql`
- Create: `src/lib/email-verification.ts`
- Test: `tests/unit/email-verification.test.ts`

**Interfaces:**
- Produces: `VERIFY_TTL_MS = 24*60*60*1000`, `UNVERIFIED_TTL_MS = 7*24*60*60*1000`; `newVerificationToken(): { token: string; tokenHash: string }`; `hashVerificationToken(token: string): string`; `appUrl(env = process.env): string`; `verificationLink(token: string, env = process.env): string` → `${appUrl}/verify-email?token=${token}`; `verificationEmail(link: string): { subject: string; text: string }`.
- Model `EmailVerificationToken { id String @id @default(cuid()); userId String; tokenHash String @unique; expiresAt DateTime; createdAt DateTime @default(now()); user User @relation(..., onDelete: Cascade); @@index([userId]) }`.

- [ ] **Step 1: Failing unit tests**
  - `newVerificationToken` returns a 43-char base64url token and `tokenHash === hashVerificationToken(token)` (64 hex chars); two calls differ.
  - `appUrl({ APP_URL: "https://landed.example/" })` → `"https://landed.example"`; `appUrl({ VERCEL_PROJECT_PRODUCTION_URL: "x.vercel.app" })` → `"https://x.vercel.app"`; `appUrl({})` → `"http://localhost:3000"`.
  - `verificationLink("abc", { APP_URL: "https://l.test" })` → `"https://l.test/verify-email?token=abc"`.
  - `verificationEmail(link).text` contains the link, `"24 hours"`, and `"didn't sign up"`; subject is `"Verify your email for Landed"`.
- [ ] **Step 2:** `npx vitest run --project unit tests/unit/email-verification.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement with `node:crypto` (`randomBytes(32).toString("base64url")`, `createHash("sha256")`).
- [ ] **Step 4:** Same command → PASS.
- [ ] **Step 5: Schema + migration.** Generate SQL with `migrate diff`, then append, so existing Google users stay verified:
  ```sql
  UPDATE "User" SET "emailVerified" = NOW()
  WHERE "emailVerified" IS NULL AND id IN (SELECT "userId" FROM "Account" WHERE provider = 'google');
  ```
  Run `npx prisma generate` and `npx tsc --noEmit` → clean.
- [ ] **Step 6: Commit** `feat(verify): token helpers, verification table and migration`.

### Task 2: Email sender

**Files:**
- Create: `src/server/mail/sender.ts`
- Test: `tests/unit/mail-sender.test.ts`

**Interfaces:**
- Produces: `type OutgoingEmail = { to: string; subject: string; text: string }`; `interface EmailSender { send(email: OutgoingEmail): Promise<void> }`; `resendSender(apiKey: string, from: string): EmailSender` (Resend SDK `emails.send`; throws on `error`); `fakeSender(outboxPath: string): EmailSender` (appends `JSON.stringify(email) + "\n"`); `consoleSender: EmailSender`; `emailSender(env = process.env): EmailSender | null`.
- Selection in `emailSender`: `EMAIL_SENDER === "fake"` → `fakeSender(FAKE_EMAIL_OUTBOX ?? <os tmpdir>/landed-outbox.jsonl)`; else `RESEND_API_KEY` set → `resendSender(key, EMAIL_FROM ?? "Landed <noreply@in.alexrchan.dev>")`; else `NODE_ENV !== "production"` → `consoleSender`; else `null`.

- [ ] **Step 1: Failing tests:** `fakeSender` appends two lines that parse back to the two emails; `emailSender` picks fake / resend (assert it's not `consoleSender` and not null) / console / null for the four env shapes.
- [ ] **Step 2:** `npx vitest run --project unit tests/unit/mail-sender.test.ts` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat(mail): email sender with Resend, fake outbox and console`.

### Task 3: Verification service and sign-up rules

**Files:**
- Create: `src/server/services/email-verification.ts`
- Modify: `src/server/services/users.ts` (`registerUser`, `verifyCredentials`)
- Test: `tests/integration/email-verification.test.ts`

**Interfaces:**
- Consumes: Task 1 helpers, Task 2 `EmailSender`.
- Produces:
  - `sendVerification(userId: string, ip: string, sender: EmailSender | null, now = new Date()): Promise<"sent" | "limited" | "unavailable">`: rate limits `verify:user:<id>` 3/h and `verify:ip:<ip>` 10/h; stores a token (`expiresAt = now + 24h`); sends `verificationEmail(verificationLink(token))`.
  - `verifyEmailToken(token: string, now = new Date()): Promise<boolean>`: true when a token with that hash exists and `expiresAt > now`; sets `emailVerified` (if null) and clears `unverifiedExpiresAt`. Does **not** delete the token.
  - `requestNewLink(email: string, ip: string, sender, now = new Date()): Promise<void>`: sends only when the user exists, has a password and is unverified; always resolves the same way.
  - `cleanupUnverified(now = new Date()): Promise<void>`: deletes users with `unverifiedExpiresAt < now` and tokens with `expiresAt < now - 24h`.
  - `registerUser(input, now = new Date())` now: runs `cleanupUnverified(now)`; on an existing email, if that user has `emailVerified === null` **and** `unverifiedExpiresAt !== null`, updates name, `passwordHash`, `unverifiedExpiresAt = now + 7d` and deletes their tokens; otherwise throws `EmailTakenError`. New users get `unverifiedExpiresAt = now + 7d`.
  - `verifyCredentials` returns `{ id, email, name, emailVerified: Date | null }`.

- [ ] **Step 1: Failing integration tests** (use `fakeSender` on a temp file; read lines back):
  - `sign-up creates an unverified user that expires in 7 days` (`emailVerified` null, `unverifiedExpiresAt` = now + 7d).
  - `sendVerification stores only a hash and emails a link to /verify-email` (token from the outbox link is not in `JSON.stringify(row)`).
  - `the same link verifies, and verifies again` (two `true`; `emailVerified` set, `unverifiedExpiresAt` null).
  - `an expired link is refused` (now + 24h + 1ms → false; user still unverified).
  - `an unknown token is refused`.
  - `a 4th send in an hour for one account is limited`; `an 11th send from one network is limited`.
  - `sign-up replaces an unverified account created by sign-up` (new password works via `verifyCredentials`, old one doesn't, old tokens gone).
  - `sign-up never replaces a verified account` and `never replaces an account from before this change` (`makeUser` with `passwordHash`, `unverifiedExpiresAt` null → `EmailTakenError`, password unchanged).
  - `cleanup deletes only sign-up accounts past 7 days` (pre-change unverified user survives).
  - `requestNewLink sends nothing for unknown, verified or Google-only users`.
- [ ] **Step 2:** `npx vitest run --project integration tests/integration/email-verification.test.ts` → FAIL.
- [ ] **Step 3:** Implement. `sendVerification` returns `"unavailable"` when `sender` is null.
- [ ] **Step 4:** → PASS; then `npm run test:integration` → all pass (existing `registerUser` callers still compile).
- [ ] **Step 5: Commit** `feat(verify): verification service and sign-up replacement rules`.

### Task 4: Enforcement

**Files:**
- Modify: `src/server/auth.config.ts` (`jwt`, `session`)
- Modify: `src/server/auth.ts` (`authorize`, Google `jwt` override)
- Modify: `src/server/oauth/grants.ts` (`verifyAccessToken`)
- Modify: `src/lib/auth-errors.ts` (`unverified` message: "Verify your email first. We've sent you a new link.")
- Test: `tests/unit/auth-session.test.ts`, `tests/integration/oauth-grants.test.ts`

**Interfaces:**
- `jwt({ token, user })` in `authConfig`: on sign-in sets `token.sub` and `token.verified = Boolean(user.emailVerified)`.
- `session({ session, token })`: sets `session.user.id` only when `token.verified === true`.
- `authorized`: `signedIn = Boolean(auth?.user?.id)`.
- `auth.ts` `authorize`: after `verifyCredentials` succeeds and `emailVerified` is null → `await sendVerification(user.id, clientIp(request.headers), emailSender())`, then `throw new Unverified()` (`CredentialsSignin` with `code = "unverified"`).
- `auth.ts` `callbacks.jwt` override (Node only): when `account?.provider === "google"` and `profile?.email_verified`, set the user's `emailVerified` if null and `token.verified = true`; then the shared logic.
- `verifyAccessToken`: also returns null when the grant's user has `emailVerified === null` (include `user: { select: { emailVerified: true } }`).

- [ ] **Step 1: Failing tests:**
  - unit: `session callback hides the user id for tokens without verified` (`{ sub: "u1" }` → no `id`; `{ sub: "u1", verified: true }` → `id: "u1"`).
  - unit: `jwt callback records verified from the user` (`emailVerified: new Date()` → true; null → false).
  - integration: `access tokens of unverified users are rejected` (setup user with `emailVerified: null` → null; existing `makeUser` setups set `emailVerified` so other tests keep passing).
- [ ] **Step 2:** run both files → FAIL.
- [ ] **Step 3:** Implement; update `tests/integration/factories.ts` `makeUser` to set `emailVerified: new Date()` by default.
- [ ] **Step 4:** run both files → PASS; `npm test && npm run test:integration` → all pass.
- [ ] **Step 5: Commit** `feat(verify): only verified users get a session or connector access`.

### Task 5: Pages and actions

**Files:**
- Modify: `src/server/actions/auth.ts` (`registerAction`; new `resendVerificationAction`, `requestNewLinkAction`)
- Modify: `src/server/auth.config.ts` (`PUBLIC_PATHS` += `/check-email`, `/verify-email`)
- Create: `src/app/(auth)/check-email/page.tsx`, `src/app/(auth)/check-email/resend-button.tsx`
- Create: `src/app/(auth)/verify-email/page.tsx`, `src/app/(auth)/verify-email/new-link-form.tsx`
- Modify: `src/app/(auth)/login/page.tsx` + `login-form.tsx` (`?verified=1` notice; `unverified` error shows a **Resend email** button for the typed address)
- Test: `tests/e2e/verify.spec.ts`

**Interfaces:**
- `registerAction`: when `emailSender()` is null → `{ ok: false, error: "Sign-up is temporarily unavailable" }` before creating anything; otherwise register, `sendVerification`, then `redirect("/check-email?email=" + encodeURIComponent(email))`.
- `resendVerificationAction(_prev, formData)` and `requestNewLinkAction(_prev, formData)` both call `requestNewLink(email, ip, emailSender())` and return `{ ok: true }`; the UI then shows "If that account needs verifying, we've sent a new link".
- `/verify-email?token=` (dynamic; `await connection()`): `verifyEmailToken` true → `redirect("/login?verified=1")`; false → "This link has expired" + `NewLinkForm`.
- `/check-email?email=`: "Check your inbox", "We sent a link to <email>", `ResendButton` (disabled 60s after each click).

- [ ] **Step 1: Failing e2e** `tests/e2e/verify.spec.ts` (needs Task 6's env and outbox helper; write them in this task's first step if not yet present):
  - `sign up → check inbox → open link → sign in` (URL `/check-email`, text "Check your inbox"; open outbox link → URL `/login?verified=1`, text "Email verified. Sign in to continue."; sign in → `/board`).
  - `an unverified sign-in shows the resend screen` (text "Verify your email first"; outbox gains a second email for that address).
  - `an expired or unknown link offers a new one` (`/verify-email?token=nope` → "This link has expired"; submit email → "If that account needs verifying, we've sent a new link").
- [ ] **Step 2:** `npx playwright test tests/e2e/verify.spec.ts` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat(verify): check-inbox, verify-email and login screens`.

### Task 6: End-to-end harness, existing specs, docs

**Files:**
- Modify: `playwright.config.ts` (env `EMAIL_SENDER: "fake"`, `FAKE_EMAIL_OUTBOX: <repo>/test-results/outbox.jsonl`, `APP_URL: http://localhost:3200`; export `E2E_OUTBOX`)
- Modify: `tests/e2e/helpers.ts` (`signUpAndVerify(page, { name, email, password })`, `latestLinkFor(email): Promise<string>` polling the outbox up to 10s)
- Modify: `tests/e2e/{core-flow,email,connector,autocomplete,table-search,security}.spec.ts`
- Modify: `README.md`, `.env.example` (`EMAIL_FROM`, `APP_URL`, `EMAIL_SENDER`/`FAKE_EMAIL_OUTBOX` test-only)

**Interfaces:**
- `signUpAndVerify` registers, opens `latestLinkFor(email)`, signs in, and waits for `/board`, replacing each spec's inline sign-up. `security.spec.ts`'s flood test expects `/check-email` after each of the first 5 sign-ups.

- [ ] **Step 1:** Update the helpers and specs.
- [ ] **Step 2:** `npx playwright test` → all pass (the known flaky `security.spec` timing tests excepted, and reported if they fail).
- [ ] **Step 3:** Docs.
- [ ] **Step 4: Commit** `test(verify): sign-up helper verifies through the fake outbox; docs`.
