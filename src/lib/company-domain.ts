const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const TLD = /^[a-z]{2,}$/;

/**
 * Turns whatever was typed or pasted ("https://www.Stripe.com/jobs") into a bare
 * hostname ("stripe.com"), or null when it isn't a public website.
 */
export function normalizeDomain(input: string): string | null {
  const value = input.trim().toLowerCase();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(HAS_SCHEME.test(value) && !/^[^:]+:\d/.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.replace(/^www\./, "");
  const labels = host.split(".");
  if (host.length > 253 || labels.length < 2) return null;
  if (!labels.every((label) => LABEL.test(label))) return null;
  return TLD.test(labels.at(-1)!) ? host : null;
}
