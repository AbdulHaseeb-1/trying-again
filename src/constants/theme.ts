/**
 * Single source of truth for design tokens.
 * Add a color, spacing, or radius here — never hard-code values in screens.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#11181C',
    textSecondary: '#687076',
    background: '#FFFFFF',
    surface: '#F0F0F3',
    surfaceVariant: '#E0E1E6',
    border: '#E5E5EA',
    primary: '#0A7EA4',
    tint: '#0A7EA4',
    tabIconDefault: '#687076',
    tabIconSelected: '#0A7EA4',
  },
  dark: {
    text: '#ECEDEE',
    textSecondary: '#9BA1A6',
    background: '#151718',
    surface: '#212225',
    surfaceVariant: '#2E3135',
    border: '#2A2D30',
    primary: '#22D3EE',
    tint: '#22D3EE',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: '#22D3EE',
  },
} as const;

export type ColorScheme = keyof typeof Colors;
export type ThemeColors = (typeof Colors)[ColorScheme];
export type ThemeColor = keyof ThemeColors;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
} as const;

export const MaxContentWidth = 800;
