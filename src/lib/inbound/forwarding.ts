const GOOGLE_SENDER = /(^|<|\s)forwarding-noreply@google\.com(>|$|\s)/i;
const LINK_HOSTS = new Set(["mail-settings.google.com", "mail.google.com"]);

/** Only a plain https link to Gmail's own confirmation page, so a spoofed email can't plant any other link. */
function confirmationLink(text: string): string | null {
  for (const candidate of text.match(/https?:\/\/\S+/g) ?? []) {
    try {
      const url = new URL(candidate);
      if (url.protocol === "https:" && !url.username && !url.password && !url.port && LINK_HOSTS.has(url.hostname) && url.pathname.startsWith("/mail/vf-")) {
        return url.href;
      }
    } catch {}
  }
  return null;
}

/**
 * Gmail's "Forwarding Confirmation" email, shown to the user so they can finish setup. Older emails carry a
 * code; newer ones only a link. Null when the email isn't one.
 */
export function gmailForwardingConfirmation(from: string, subject: string, text: string): { code: string | null; link: string | null } | null {
  if (!GOOGLE_SENDER.test(from.trim()) || !/forwarding confirmation/i.test(subject)) return null;
  const match = subject.match(/\(#(\d{6,12})\)/) ?? text.match(/confirmation code:\s*(\d{6,12})/i);
  return { code: match?.[1] ?? null, link: confirmationLink(text) };
}
