import { appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Resend } from "resend";

export type OutgoingEmail = { to: string; subject: string; text: string };

export interface EmailSender {
  send(email: OutgoingEmail): Promise<void>;
}

const DEFAULT_FROM = "Landed <noreply@in.alexrchan.dev>";

export function resendSender(apiKey: string, from: string): EmailSender {
  const resend = new Resend(apiKey);
  return {
    async send({ to, subject, text }) {
      const { error } = await resend.emails.send({ from, to, subject, text });
      if (error) throw new Error(`Resend send failed: ${error.message}`);
    },
  };
}

/** For end-to-end tests (EMAIL_SENDER=fake): each email becomes one JSON line in a file the tests read. */
export function fakeSender(outboxPath: string): EmailSender {
  return {
    async send(email) {
      await appendFile(outboxPath, `${JSON.stringify(email)}\n`);
    },
  };
}

/** Local development without Resend: the email, link included, goes to the server console. */
export const consoleSender: EmailSender = {
  async send({ to, subject, text }) {
    console.info(`[email to ${to}] ${subject}\n${text}`);
  },
};

/** Resend in production; the fake for end-to-end tests; the console in development. Null in production without Resend. */
export function emailSender(env: Record<string, string | undefined> = process.env): EmailSender | null {
  if (env.EMAIL_SENDER === "fake") return fakeSender(env.FAKE_EMAIL_OUTBOX ?? join(tmpdir(), "landed-outbox.jsonl"));
  if (env.RESEND_API_KEY) return resendSender(env.RESEND_API_KEY, env.EMAIL_FROM || DEFAULT_FROM);
  if (env.NODE_ENV !== "production") return consoleSender;
  return null;
}
