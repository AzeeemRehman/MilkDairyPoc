/**
 * Date helpers. Business dates are stored as Postgres DATE and handled as UTC-midnight
 * Date objects so no timezone shift can move a day. "Today" is computed in Asia/Karachi.
 */
export const TIMEZONE = "Asia/Karachi";

/** 'YYYY-MM-DD' → Date at UTC midnight */
export function parseDate(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) throw new Error(`Invalid date: ${s}`);
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCMonth() !== +m[2] - 1) throw new Error(`Invalid date: ${s}`);
  return d;
}

/** Date → 'YYYY-MM-DD' (UTC parts) */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Date → 'DD/MM/YYYY' */
export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const s = typeof d === "string" ? d.slice(0, 10) : isoDate(d);
  const [y, m, day] = s.split("-");
  return `${day}/${m}/${y}`;
}

export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function today(): Date {
  return parseDate(todayIso());
}

/** 'YYYY-MM' for a date */
export function periodOf(d: Date): string {
  return isoDate(d).slice(0, 7);
}

export function isValidPeriod(p: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(p);
}

export function periodRange(period: string): { start: Date; end: Date } {
  if (!isValidPeriod(period)) throw new Error(`Invalid period: ${period}`);
  const [y, m] = period.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 0)) };
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86400000);
}

export function previousPeriod(period: string): string {
  const { start } = periodRange(period);
  return periodOf(addDays(start, -1));
}

export function nextPeriod(period: string): string {
  const { end } = periodRange(period);
  return periodOf(addDays(end, 1));
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export function eachDay(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

export function formatPeriod(period: string): string {
  const { start } = periodRange(period);
  return start.toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}
