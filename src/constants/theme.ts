/** MarketPulse's single dark design system. */

import { Platform } from 'react-native';

export const Colors = {
  dark: {
    background: '#0B0B0C',
    surface: '#151516',
    surfaceVariant: '#1D1D1F',
    card: '#171719',
    border: 'rgba(255,255,255,0.075)',
    borderStrong: 'rgba(255,255,255,0.12)',
    text: '#F5F5F4',
    textSecondary: '#AAA9A5',
    textMuted: '#777673',
    primary: '#38BDF8',
    secondary: '#5EEAD4',
    positive: '#2BD576',
    negative: '#FF5E6C',
    warning: '#F5B942',
    overlay: 'rgba(0,0,0,0.56)',
    tabIconDefault: '#66727F',
    tabIconSelected: '#29B6F6',
  },
} as const;

export type ColorScheme = keyof typeof Colors;
export type ThemeColors = (typeof Colors)[ColorScheme];
export type ThemeColor = keyof ThemeColors;

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', mono: 'ui-monospace' },
  android: { sans: 'sans-serif', mono: 'monospace' },
  web: { sans: 'var(--font-display)', mono: 'var(--font-mono)' },
  default: { sans: 'normal', mono: 'monospace' },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 6,
  three: 10,
  four: 12,
  five: 16,
  six: 20,
  seven: 28,
  eight: 32,
} as const;

export const Radius = {
  sm: 10,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
} as const;

export const MaxContentWidth = 560;
