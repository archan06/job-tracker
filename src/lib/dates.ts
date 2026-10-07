// Dates without a time of day (like "date applied") are stored as UTC midnight
// and always formatted in UTC, so they never shift a day across time zones.

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDateOnly(value: string): Date {
  const match = DATE_ONLY.exec(value);
  if (!match) throw new Error(`Invalid date: ${value}`);
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  // Date.UTC rolls over (Feb 30 → Mar 2); reject instead.
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    throw new Error(`Invalid date: ${value}`);
  }
  return date;
}

const displayFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export function formatDateOnly(date: Date): string {
  return displayFormat.format(date);
}

export function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" for a moment in the viewer's own time zone. Call it in the browser. */
export function localDateString(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayUtc(now = new Date()): Date {
  return parseDateOnly(now.toISOString().slice(0, 10));
}

const DAY_MS = 86_400_000;

/**
 * The calendar day to record for an action. The browser knows the viewer's local date;
 * the server only knows UTC. Trust the browser's date when it's within a day of the
 * server's (every real time zone is), otherwise use the server's UTC date.
 */
export function resolveToday(clientDate: string | undefined, now = new Date()): Date {
  const serverToday = todayUtc(now);
  if (!clientDate) return serverToday;
  try {
    const client = parseDateOnly(clientDate);
    return Math.abs(client.getTime() - serverToday.getTime()) <= DAY_MS ? client : serverToday;
  } catch {
    return serverToday;
  }
}
