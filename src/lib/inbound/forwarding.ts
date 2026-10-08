const GOOGLE_SENDER = /(^|<|\s)forwarding-noreply@google\.com(>|$|\s)/i;

/** The code from Gmail's "Forwarding Confirmation" email, shown to the user so they can finish setup. */
export function gmailForwardingCode(from: string, subject: string, text: string): string | null {
  if (!GOOGLE_SENDER.test(from.trim()) || !/forwarding confirmation/i.test(subject)) return null;
  const match = subject.match(/\(#(\d{6,12})\)/) ?? text.match(/confirmation code:\s*(\d{6,12})/i);
  return match?.[1] ?? null;
}
