/**
 * The visitor's IP address for rate limiting. Vercel sets x-real-ip itself, so it can't be
 * spoofed there; on other hosts, only trust these headers behind a proxy that overwrites them.
 */
export function clientIp(headers: Headers): string {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "unknown";
}
