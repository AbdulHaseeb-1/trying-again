import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { toneColor } from '@/components/market-ui';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import type { Tone } from '@/data/market';
import { WINDOW_LABELS, changeTone, formatPercent, type Window, type WindowValues } from '@/data/derivatives';
import { useTheme } from '@/hooks/use-theme';

/** The one card shape the whole screen is built from. */
export function Card({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      {title ? (
        <View style={styles.cardHeader}>
          <ThemedText style={styles.cardTitle}>{title}</ThemedText>
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** Headline number with its change beside it. */
export function KeyMetric({
  label,
  value,
  change,
  note,
  tone,
}: {
  label: string;
  value: string;
  change?: string;
  note?: string;
  tone?: Tone;
}) {
  const theme = useTheme();
  return (
    <View style={styles.keyMetric}>
      <ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>
      <View style={styles.keyMetricLine}>
        <ThemedText style={styles.keyMetricValue}>{value}</ThemedText>
        {change ? (
          <ThemedText type="smallBold" style={{ color: toneColor(theme, tone ?? 'neutral') }}>{change}</ThemedText>
        ) : null}
      </View>
      {note ? <ThemedText type="small" themeColor="textMuted">{note}</ThemedText> : null}
    </View>
  );
}

export type Stat = { label: string; value: string; note?: string; tone?: Tone };

/** Two-column grid of secondary numbers. */
export function StatGrid({ stats }: { stats: Stat[] }) {
  const theme = useTheme();
  return (
    <View style={styles.grid}>
      {stats.map((stat) => (
        <View key={stat.label} style={styles.gridCell}>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{stat.label}</ThemedText>
          <ThemedText style={styles.gridValue}>{stat.value}</ThemedText>
          {stat.note ? (
            // Two lines: a note explaining what a ratio means does not fit one
            // at phone width, and a truncated explanation explains nothing.
            <ThemedText type="small" style={{ color: toneColor(theme, stat.tone ?? 'neutral') }} numberOfLines={2}>
              {stat.note}
            </ThemedText>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/**
 * Long versus short as one bar.
 *
 * Both sides are always drawn — an all-long hour is a real reading, and a bar
 * that silently disappears at the extremes is the one case where the picture
 * matters most.
 */
export function SplitBar({
  longPercent,
  longLabel,
  shortLabel,
  height = 10,
}: {
  longPercent: number;
  longLabel?: string;
  shortLabel?: string;
  height?: number;
}) {
  const theme = useTheme();
  const clamped = Math.max(0, Math.min(100, longPercent));
  return (
    <View style={styles.splitWrap}>
      {longLabel || shortLabel ? (
        <View style={styles.splitLabels}>
          <ThemedText type="smallBold" style={{ color: theme.positive }}>{longLabel}</ThemedText>
          <ThemedText type="smallBold" style={{ color: theme.negative }}>{shortLabel}</ThemedText>
        </View>
      ) : null}
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ now: Math.round(clamped), min: 0, max: 100 }}
        style={[styles.splitTrack, { height, backgroundColor: `${theme.negative}55` }]}>
        <View style={[styles.splitFill, { width: `${clamped}%`, backgroundColor: theme.positive }]} />
      </View>
    </View>
  );
}

/**
 * A labelled proportion bar — venue share of open interest, and the like.
 *
 * It fills the width it is given, which a column hands it for free. Inside a
 * flex row the caller must give it room (`flex: 1` on a wrapper): putting the
 * flex here would stretch the 6px track down the height of every card it sits
 * in, since a column's main axis is the vertical one.
 */
export function ShareBar({ percent, tone = 'positive' }: { percent: number; tone?: Tone }) {
  const theme = useTheme();
  const color = toneColor(theme, tone);
  return (
    <View style={[styles.shareTrack, { backgroundColor: theme.neutralBar }]}>
      <View style={[styles.shareFill, { width: `${Math.max(1, Math.min(100, percent))}%`, backgroundColor: color }]} />
    </View>
  );
}

/** The same measure across every window the service reports it over. */
export function WindowStrip({
  values,
  windows,
  format = (value: number) => formatPercent(value),
}: {
  values: WindowValues;
  windows: Window[];
  format?: (value: number) => string;
}) {
  const theme = useTheme();
  const present = windows.filter((window) => values[window] !== undefined);
  if (!present.length) return null;

  return (
    <View style={styles.strip}>
      {present.map((window) => {
        const value = values[window] as number;
        return (
          <View key={window} style={[styles.stripCell, { borderColor: theme.border }]}>
            <ThemedText type="small" themeColor="textMuted">{WINDOW_LABELS[window]}</ThemedText>
            <ThemedText type="smallBold" style={{ color: toneColor(theme, changeTone(value)) }}>
              {format(value)}
            </ThemedText>
          </View>
        );
      })}
    </View>
  );
}

/** Label on the left, value on the right — the workhorse list row. */
export function DataRow({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: Tone;
}) {
  const theme = useTheme();
  return (
    <View style={styles.dataRow}>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.dataLabel}>
        {label}
      </ThemedText>
      <View style={styles.dataValues}>
        <ThemedText type="smallBold" style={styles.tabular}>{value}</ThemedText>
        {note ? (
          <ThemedText type="small" style={[styles.tabular, { color: toneColor(theme, tone ?? 'neutral') }]}>
            {note}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

export function Divider() {
  const theme = useTheme();
  return <View style={[styles.divider, { backgroundColor: theme.border }]} />;
}

/** One sentence of plain-language context under a chart or table. */
export function Note({ children }: { children: ReactNode }) {
  return (
    <ThemedText type="small" themeColor="textMuted">
      {children}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.lg,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  cardTitle: { fontSize: 15, lineHeight: 20, fontWeight: '700', letterSpacing: -0.2 },
  keyMetric: { gap: Spacing.one },
  keyMetricLine: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two, flexWrap: 'wrap' },
  keyMetricValue: { fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.8, fontVariant: ['tabular-nums'] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: Spacing.four, columnGap: Spacing.three },
  gridCell: { flexGrow: 1, flexBasis: '44%', gap: 2 },
  gridValue: { fontSize: 17, lineHeight: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  splitWrap: { gap: Spacing.two },
  splitLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  splitTrack: { overflow: 'hidden', borderRadius: Radius.full },
  splitFill: { height: '100%', borderRadius: Radius.full },
  shareTrack: { width: '100%', height: 6, borderRadius: Radius.full, overflow: 'hidden' },
  shareFill: { height: '100%', borderRadius: Radius.full },
  strip: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  stripCell: {
    flexGrow: 1,
    minWidth: 62,
    alignItems: 'center',
    gap: 1,
    paddingVertical: Spacing.two,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dataRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three, minHeight: 26 },
  dataLabel: { flex: 1 },
  dataValues: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  tabular: { fontVariant: ['tabular-nums'] },
  divider: { height: StyleSheet.hairlineWidth, width: '100%' },
});
