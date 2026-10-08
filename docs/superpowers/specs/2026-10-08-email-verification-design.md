# Email verification — design

## Goal

Sign-up accepts any well-formed address, including ones nobody owns (`test@test.com`, `asdf@asdfasdf.xyz`). Require people to prove they own the inbox before they can use Landed.

## Decisions (made with Alex)

- **Verification email**, not just a domain check.
- **Hard gate:** an unverified account cannot sign in. Nobody unverified reaches the app.
- **Existing accounts verify on next sign-in.** Google accounts count as verified. Accounts created before this change are never auto-deleted.
- **Sender:** `Landed <noreply@in.alexrchan.dev>` (the domain already in Resend), configurable with `EMAIL_FROM`.

## What people see

### Signing up
1. The form is unchanged. Submitting creates the account **unverified** and emails a link.
2. The person lands on **"Check your inbox"** (`/check-email`), which shows the address and a **Resend email** button (disabled for 60 seconds after each click). They are not signed in.
3. The link (`/verify-email?token=…`) opens **"Verify and sign in"**: the person enters their password, and the account is verified and signed in only when the link belongs to that account **and** the password matches. Opening the link alone changes nothing. Links expire after 24 hours.
   - *Changed after review:* originally the link verified on its own. Then a stranger who signed up with your address (setting their password) would own the verified account once you clicked. Requiring the password as well means only someone with both the inbox and the password can verify.

### Signing in while unverified
- Correct password, unverified account: sign-in is refused, a fresh link is sent (subject to rate limits), and the login form shows "Verify your email first" with a **Resend email** button.
- Wrong password: the normal error. No email is sent, so the login form can't be used to send email to someone else's address.

### Expired, unknown or reused links
- A link stays valid until it expires. Email security scanners often open links before the person does; since opening a link changes nothing, that's harmless.
- Expired or unknown links show "This link has expired" with an email field to request a new one. That form always answers "If that account needs verifying, we've sent a new link", so it reveals nothing about which addresses have accounts.

### Someone signs up with your address and never verifies
- Signing up with an address whose account is unverified **and was created after this change** replaces that account (new name and password, new link). Only a verified address, or any account from before this change, counts as "already taken".
- Older unverified accounts are never replaced, so a stranger can't overwrite the password of a real pre-existing account. Their owner verifies on their next sign-in.

### Google sign-in
- A new Google account is marked verified when Google reports the address as verified.

### Existing accounts
- Everyone is signed out once (old sessions don't record `verified`).
- Password accounts verify on their next sign-in. Accounts created before this change are never auto-deleted.
- Unverified accounts created after this change are deleted 7 days after sign-up.

## Design

### Data (one migration)
- `User.emailVerified` (exists, unused today): set when the account is verified.
- `User.unverifiedExpiresAt DateTime?` (new): sign-up time + 7 days for accounts created by sign-up from now on; null for existing accounts and Google accounts. Cleared on verification. It marks an account as both deletable and replaceable.
- `EmailVerificationToken` (new): `id`, `userId` (cascade delete), `tokenHash @unique`, `expiresAt`, `createdAt`. The link carries 32 random bytes (base64url); only the SHA-256 hash is stored.
- Cleanup, run during sign-up like Landed's other inline cleanups: delete users whose `unverifiedExpiresAt` has passed, and tokens whose `expiresAt` passed more than 24 hours ago.

### Sending (`src/server/mail/`, shaped like `src/server/inbound/`)
- `EmailSender` interface: `send({ to, subject, text }): Promise<void>`.
- `resendSender(apiKey, from)`: Resend's send API.
- `fakeSender(outboxPath)`: appends each email as one JSON line to a file, for end-to-end tests (`EMAIL_SENDER=fake`, `FAKE_EMAIL_OUTBOX`).
- `consoleSender`: development without Resend; prints the link to the server console.
- Selection: `EMAIL_SENDER=fake` → fake. Otherwise, with `RESEND_API_KEY` and `EMAIL_FROM` → Resend. Otherwise, outside production → console. In production without config → none, and sign-up answers "Sign-up is temporarily unavailable" without creating an account.
- Links are built from `APP_URL`, falling back to `https://${VERCEL_PROJECT_PRODUCTION_URL}`, then `http://localhost:3000`. Never from the request's Host header, which an attacker can forge to point links at their own site.
- The email is plain text: what it is, the link, that it expires in 24 hours, and "ignore this if you didn't sign up".
- Rate limits on sending: 3 per account per hour, 10 per network per hour. A blocked send still shows the "Check your inbox" screen, with a message to try again later.

### Enforcement
- **Credentials sign-in** (`authorize`): after the password checks out, an unverified user is verified if the request carries a live token for that account (from "Verify and sign in"); otherwise a link is sent and the sign-in is refused with `unverified` (or `unverified_unsent` when no link could be sent).
- A failed send never throws: `sendVerification` returns `"failed"`, so an email outage can't break sign-up or sign-in.
- **Session:** the `jwt` callback records `verified: true` at sign-in (credentials users only get there verified; Google users are verified at creation). The proxy's `authorized` callback, `requireUserId()`, the `/api/suggest/*` routes and the OAuth authorize page treat a session without `verified` as signed out.
- **Google:** in Auth.js's `createUser` / `linkAccount` events, set `emailVerified` when the Google profile has `email_verified`.
- **Claude connector:** MCP bearer-token checks reject tokens belonging to users without `emailVerified`.

## Testing
- **Unit:** token generation and hashing; links built only from `APP_URL` (or its fallbacks); expiry; the email text.
- **Integration (test database):**
  - sign-up creates an unverified user, a token and exactly one email
  - verify succeeds, succeeds again with the same link, and fails once expired
  - an unverified post-change account is replaced; verified and pre-change accounts are not
  - cleanup deletes only post-change unverified accounts past their 7 days
  - send rate limits
  - a wrong password sends nothing
  - unverified users' connector tokens are rejected
- **End-to-end:**
  - sign up → check inbox → open link → sign in
  - unverified sign-in shows the resend screen
  - expired link → request a new one
- **Existing end-to-end tests:** the six files that sign up users use a shared helper that signs up, reads the link from the fake outbox and opens it. Test intent is unchanged.

## Rollout
1. In Resend, re-verify `in.alexrchan.dev` (its `rsend.in` record shows failed although DNS is correct) until sending shows Verified.
2. Add to Vercel: `EMAIL_FROM` and `APP_URL=https://job-tracker-eight-orcin.vercel.app`. `RESEND_API_KEY` is reused.
3. Deploy. Everyone is signed out once; Alex verifies on next sign-in.

## Out of scope
- Password reset and changing email address (both could reuse the sender later).
- HTML email templates.
