/**
 * All loan maths works on calendar days (no clock time), so every date is
 * normalised to UTC midnight before it is compared or subtracted. This keeps
 * results identical regardless of the phone's timezone.
 */

export const MS_PER_DAY = 86400000;

/** 'YYYY-MM-DD' (or an ISO timestamp) -> Date at UTC midnight. */
export function parseDay(value: string | Date): Date {
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  }
  const text = String(value).slice(0, 10);
  const [y, m, d] = text.split('-').map((n) => parseInt(n, 10));
  if (!y || !m || !d) {
    const fallback = new Date(value);
    return new Date(Date.UTC(fallback.getFullYear(), fallback.getMonth(), fallback.getDate()));
  }
  return new Date(Date.UTC(y, m - 1, d));
}

/** Date -> 'YYYY-MM-DD'. */
export function toDayString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Today in the device's local calendar, as 'YYYY-MM-DD'. */
export function todayString(): string {
  const now = new Date();
  return toDayString(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

/** Whole days from a to b (negative if b is before a). */
export function daysBetween(a: string | Date, b: string | Date): number {
  return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / MS_PER_DAY);
}

export function addDays(value: string | Date, days: number): string {
  const d = parseDay(value);
  d.setUTCDate(d.getUTCDate() + days);
  return toDayString(d);
}

/**
 * Calendar month arithmetic that never overflows: 31 Jan + 1 month = 28 Feb.
 */
export function addMonths(value: string | Date, months: number): string {
  const d = parseDay(value);
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDayOfTarget = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDayOfTarget));
  return toDayString(target);
}

export function isBefore(a: string | Date, b: string | Date): boolean {
  return parseDay(a).getTime() < parseDay(b).getTime();
}

export function isAfter(a: string | Date, b: string | Date): boolean {
  return parseDay(a).getTime() > parseDay(b).getTime();
}

export function minDay(a: string, b: string): string {
  return isBefore(a, b) ? a : b;
}

export function maxDay(a: string, b: string): string {
  return isAfter(a, b) ? a : b;
}
