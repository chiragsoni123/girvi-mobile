/**
 * Design tokens ported from the web prototype's Tailwind palette
 * (stone greys + a switchable jewel accent).
 */

import { AccentColor } from '../types/girvi';

/** Neutral scale — Tailwind `stone`. */
export const neutral = {
  50: '#fafaf9',
  100: '#f5f5f4',
  200: '#e7e5e4',
  300: '#d6d3d1',
  400: '#a8a29e',
  500: '#78716c',
  600: '#57534e',
  700: '#44403c',
  800: '#292524',
  900: '#1c1917',
  950: '#0c0a09',
};

export const semantic = {
  success: '#059669',
  successSoft: '#d1fae5',
  successText: '#065f46',
  danger: '#e11d48',
  dangerSoft: '#ffe4e6',
  dangerText: '#9f1239',
  warning: '#d97706',
  warningSoft: '#fef3c7',
  warningText: '#92400e',
  info: '#2563eb',
  infoSoft: '#dbeafe',
  infoText: '#1e40af',
};

export interface AccentTheme {
  id: AccentColor;
  name: string;
  subtitle: string;
  /** Solid accent used for primary buttons, FAB, active tabs. */
  primary: string;
  /** Lighter partner used in gradients / highlights. */
  secondary: string;
  /** Tinted background for chips and soft cards. */
  soft: string;
  /** Readable text colour on `soft`. */
  softText: string;
  /** Text/icon colour that sits on top of `primary`. */
  onPrimary: string;
  /** Accent that reads well on the dark app bar. */
  onDark: string;
}

export const ACCENT_THEMES: Record<AccentColor, AccentTheme> = {
  gold: {
    id: 'gold',
    name: 'Imperial Gold',
    subtitle: 'Classic warm bullion & jeweller heritage',
    primary: '#f59e0b',
    secondary: '#fbbf24',
    soft: '#fef3c7',
    softText: '#78350f',
    onPrimary: '#0c0a09',
    onDark: '#fbbf24',
  },
  emerald: {
    id: 'emerald',
    name: 'Royal Emerald',
    subtitle: 'Prestige gemstone & high security trust',
    primary: '#059669',
    secondary: '#10b981',
    soft: '#d1fae5',
    softText: '#064e3b',
    onPrimary: '#ffffff',
    onDark: '#34d399',
  },
  sapphire: {
    id: 'sapphire',
    name: 'Sapphire Blue',
    subtitle: 'Institutional clarity & high contrast',
    primary: '#1d4ed8',
    secondary: '#3b82f6',
    soft: '#dbeafe',
    softText: '#1e3a8a',
    onPrimary: '#ffffff',
    onDark: '#60a5fa',
  },
  ruby: {
    id: 'ruby',
    name: 'Ruby Crimson',
    subtitle: 'Deep royal Indian ledger & gemstone tone',
    primary: '#be123c',
    secondary: '#f43f5e',
    soft: '#ffe4e6',
    softText: '#881337',
    onPrimary: '#ffffff',
    onDark: '#fb7185',
  },
  slate: {
    id: 'slate',
    name: 'Platinum Slate',
    subtitle: 'Monochrome minimalist & high legibility',
    primary: '#334155',
    secondary: '#64748b',
    soft: '#f1f5f9',
    softText: '#0f172a',
    onPrimary: '#ffffff',
    onDark: '#cbd5e1',
  },
  amethyst: {
    id: 'amethyst',
    name: 'Royal Amethyst',
    subtitle: 'Refined violet & distinctive luxury aesthetic',
    primary: '#7e22ce',
    secondary: '#a855f7',
    soft: '#f3e8ff',
    softText: '#581c87',
    onPrimary: '#ffffff',
    onDark: '#c084fc',
  },
};

export const ACCENT_LIST = Object.values(ACCENT_THEMES);

export function getAccent(color?: string | null): AccentTheme {
  if (color && color in ACCENT_THEMES) return ACCENT_THEMES[color as AccentColor];
  return ACCENT_THEMES.gold;
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
};

export const typography = {
  title: { fontSize: 20, fontWeight: '800' as const },
  heading: { fontSize: 16, fontWeight: '700' as const },
  body: { fontSize: 14, fontWeight: '500' as const },
  small: { fontSize: 12, fontWeight: '500' as const },
  tiny: { fontSize: 10.5, fontWeight: '600' as const },
  mono: { fontFamily: 'monospace' as const },
};

export const shadow = {
  card: {
    shadowColor: '#0c0a09',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
  raised: {
    shadowColor: '#0c0a09',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 7,
  },
};

export const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  ACTIVE: { bg: semantic.successSoft, text: semantic.successText },
  CLOSED: { bg: neutral[200], text: neutral[700] },
  OVERDUE: { bg: semantic.dangerSoft, text: semantic.dangerText },
  AUCTIONED: { bg: semantic.warningSoft, text: semantic.warningText },
  NOTICE_SENT: { bg: semantic.infoSoft, text: semantic.infoText },
};
