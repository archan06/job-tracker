import { Resend } from "resend";
import { Webhook } from "standardwebhooks";
import { htmlToText } from "@/lib/inbound/text";

export type ReceivedEvent =
  | { type: "email.received"; emailId: string; messageId: string; from: string; subject: string; recipients: string[]; createdAt: Date }
  | { type: "other" };

export type FetchedEmail = { from: string; subject: string; text: string; date: Date; messageId: string };

export interface InboundProvider {
  /** The event if the signature is valid, otherwise null. */
  verify(rawBody: string, headers: Headers): ReceivedEvent | null;
  fetch(emailId: string): Promise<FetchedEmail>;
}

/** Resend sends Standard Webhooks signatures under svix-* names; accept webhook-* too. */
function signatureHeaders(headers: Headers) {
  const get = (name: string) => headers.get(`svix-${name}`) ?? headers.get(`webhook-${name}`);
  const id = get("id");
  const timestamp = get("timestamp");
  const signature = get("signature");
  return id && timestamp && signature ? { id, timestamp, signature } : null;
}

type RawEvent = { type?: string; created_at?: string; data?: Record<string, unknown> };

function toEvent(raw: RawEvent): ReceivedEvent {
  if (raw.type !== "email.received" || !raw.data) return { type: "other" };
  const d = raw.data as { email_id: string; message_id: string; from: string; subject: string; to?: string[]; received_for?: string[] };
  return {
    type: "email.received",
    emailId: d.email_id,
    // Some emails have no Message-ID; Resend's own id keeps them from colliding as "duplicates".
    messageId: d.message_id?.trim() || d.email_id,
    from: d.from,
    subject: d.subject ?? "",
    recipients: [...(d.received_for ?? []), ...(d.to ?? [])],
    createdAt: new Date(raw.created_at ?? Date.now()),
  };
}

export function resendProvider(apiKey: string, webhookSecret: string): InboundProvider {
  const resend = new Resend(apiKey);
  return {
    verify(rawBody, headers) {
      const sig = signatureHeaders(headers);
      if (!sig) return null;
      try {
        return toEvent(resend.webhooks.verify({ payload: rawBody, headers: sig, webhookSecret }) as unknown as RawEvent);
      } catch {
        return null;
      }
    },
    async fetch(emailId) {
      const { data, error } = await resend.emails.receiving.get(emailId);
      if (error || !data) throw new Error(`Resend fetch failed: ${error?.message ?? "no data"}`);
      return {
        from: data.from,
        subject: data.subject ?? "",
        text: data.text?.trim() || htmlToText(data.html ?? ""),
        date: new Date(data.created_at),
        messageId: data.message_id,
      };
    },
  };
}

/**
 * For end-to-end tests (INBOUND_PROVIDER=fake): same signature check, and the email's text travels
 * in the event itself (`data.fake_text`), so nothing calls Resend.
 */
export function fakeProvider(webhookSecret: string): InboundProvider {
  const received = new Map<string, FetchedEmail>();
  return {
    verify(rawBody, headers) {
      const sig = signatureHeaders(headers);
      if (!sig) return null;
      let raw: RawEvent;
      try {
        raw = new Webhook(webhookSecret).verify(rawBody, {
          "webhook-id": sig.id,
          "webhook-timestamp": sig.timestamp,
          "webhook-signature": sig.signature,
        }) as RawEvent;
      } catch {
        return null;
      }
      const event = toEvent(raw);
      if (event.type === "email.received") {
        received.set(event.emailId, {
          from: event.from,
          subject: event.subject,
          text: String(raw.data?.fake_text ?? ""),
          date: event.createdAt,
          messageId: event.messageId,
        });
      }
      return event;
    },
    async fetch(emailId) {
      const email = received.get(emailId);
      if (!email) throw new Error("Unknown fake email");
      return email;
    },
  };
}
