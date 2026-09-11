import { Platform, StyleSheet } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';

/**
 * The agent panel's own measurements.
 *
 * The application's spacing and radius scales are shared, but a conversation
 * surface needs a few decisions the rest of the app does not have: the reading
 * measure of a message, the height of a toolbar, the size of a control that has
 * to stay comfortable under a thumb.
 *
 * The discipline borrowed from iOS is mostly negative — fewer borders, fewer
 * shadows, one accent — so most of what follows is about *restraint*: hairlines
 * instead of strokes, one elevation, and a single corner radius family.
 */

export const AgentLayout = {
  /** A compact toolbar, the way a navigation bar is compact. */
  toolbarHeight: 48,
  /** Anything tappable clears the 44pt minimum, with hit slop where it cannot. */
  minTouch: 44,
  /** Visual size of a toolbar icon button; hit slop makes up the rest. */
  iconButton: 32,
  /** Where a docked panel sits between on a wide window. */
  dockedMinWidth: 340,
  dockedMaxWidth: 520,
  dockedDefaultWidth: 400,
  /** Below this the panel becomes a full-screen sheet rather than a sidebar. */
  dockBreakpoint: 900,
  /** The reading measure for a message. Wider than this and prose tires. */
  messageMaxWidth: 620,
  composerMinHeight: 44,
  composerMaxHeight: 132,
} as const;

export const AgentType = {
  /** Message body. 16 is the smallest size that avoids an iOS zoom on focus. */
  body: { fontSize: 16, lineHeight: 23 },
  /** Secondary lines: tool labels, timestamps, source names. */
  meta: { fontSize: 13, lineHeight: 18 },
  /** Captions and counters. */
  caption: { fontSize: 11, lineHeight: 15, letterSpacing: 0.1 },
  /** Toolbar and sheet titles. */
  title: { fontSize: 16, lineHeight: 20, fontWeight: '600' as const, letterSpacing: -0.2 },
  /** The one large title, on the empty state. */
  display: { fontSize: 22, lineHeight: 27, fontWeight: '700' as const, letterSpacing: -0.5 },
} as const;

export const AgentMotion = {
  /** Subtle and quick. Anything slower reads as lag, not polish. */
  enter: 180,
  exit: 140,
  spring: { damping: 26, stiffness: 280, mass: 0.7 },
} as const;

export const hairline = StyleSheet.hairlineWidth;

export const agentStyles = StyleSheet.create({
  /** A grouped row, the way a settings list groups rows. */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: AgentLayout.minTouch,
    paddingHorizontal: Spacing.four,
  },
  /** A surface that separates by tone rather than by a stroke. */
  card: {
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    height: 28,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.full,
  },
  separator: { height: hairline },
});

/** `boxShadow` is the supported cross-platform form in RN 0.8x. */
export const softShadow = Platform.select({
  web: { boxShadow: '0 12px 32px rgba(0,0,0,0.32)' },
  default: { elevation: 16, boxShadow: '0px 8px 24px rgba(0,0,0,0.34)' },
}) as object;
