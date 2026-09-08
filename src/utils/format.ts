import { parseDay } from './dates';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Indian digit grouping (1,23,456) done by hand rather than through Intl —
 * Hermes' Intl support varies by Android version and this must never differ
 * between two phones printing the same receipt.
 */
export function groupIndian(value: number): string {
  const negative = value < 0;
  const whole = Math.abs(Math.round(value)).toString();

  let grouped: string;
  if (whole.length <= 3) {
    grouped = whole;
  } else {
    const last3 = whole.slice(-3);
    const rest = whole.slice(0, -3);
    grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
  }
  return negative ? `-${grouped}` : grouped;
}

export function formatCurrency(amount: number, symbol = '₹'): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return `${symbol}0`;
  return `${symbol}${groupIndian(amount)}`;
}

/** Compact display for dashboard tiles: ₹2.5L, ₹1.2Cr. */
export function formatCompactCurrency(amount: number, symbol = '₹'): string {
  const abs = Math.abs(amount);
  if (abs >= 10000000) return `${symbol}${(amount / 10000000).toFixed(2)}Cr`;
  if (abs >= 100000) return `${symbol}${(amount / 100000).toFixed(2)}L`;
  if (abs >= 1000) return `${symbol}${(amount / 1000).toFixed(1)}K`;
  return formatCurrency(amount, symbol);
}

export function formatGrams(grams: number): string {
  if (grams === null || grams === undefined || Number.isNaN(grams)) return '0.00 g';
  return `${Number(grams).toFixed(2)} g`;
}

export function formatDate(dateString?: string | null): string {
  if (!dateString) return '—';
  try {
    const d = parseDay(dateString);
    if (Number.isNaN(d.getTime())) return String(dateString);
    return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  } catch {
    return String(dateString);
  }
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${formatDate(iso)} · ${hh}:${mm}`;
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function titleCase(value: string): string {
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Parses a user-typed amount, tolerating commas and stray spaces. */
export function parseAmount(text: string): number {
  const cleaned = String(text).replace(/[^0-9.-]/g, '');
  const value = parseFloat(cleaned);
  return Number.isFinite(value) ? value : 0;
}
