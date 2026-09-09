import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Tap } from '@/components/tap';
import { ThemedText } from '@/components/themed-text';
import { CurrencyBadge } from '@/components/calendar/currency-badge';
import { ImpactMark } from '@/components/calendar/impact-mark';
import { Radius, Spacing } from '@/constants/theme';
import { formatTime, type CalendarEvent } from '@/data/calendar';
import { useTheme } from '@/hooks/use-theme';

/**
 * One release, on one line.
 *
 * The layout is deliberately fixed-width on both edges — time on the left,
 * the actual/forecast/previous triplet on the right — so the numbers form
 * columns down the list and can be compared without reading any labels. The
 * labels appear once, in the day header, rather than on every row.
 */
function EventRowComponent({
  event,
  onSelect,
  isNext = false,
  isPast = false,
}: {
  event: CalendarEvent;
  /** Takes the event so the callback can stay referentially stable and keep memo effective. */
  onSelect?: (event: CalendarEvent) => void;
  isNext?: boolean;
  isPast?: boolean;
}) {
  const theme = useTheme();
  const past = isPast;
  const actualColor =
    event.outcome === 'better'
      ? theme.positive
      : event.outcome === 'worse'
        ? theme.negative
        : theme.text;

  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={`${event.currency} ${event.title} at ${formatTime(event)}, ${event.impact} impact${
        event.actual ? `, actual ${event.actual}` : ''
      }`}
      onPress={onSelect ? () => onSelect(event) : undefined}
      haptic="none"
      style={[
        styles.row,
        { borderBottomColor: theme.border },
        isNext && { backgroundColor: `${theme.primary}0F` },
      ]}>
      {isNext ? <View style={[styles.nextRail, { backgroundColor: theme.primary }]} /> : null}

      <ThemedText
        style={[styles.time, { color: past && !isNext ? theme.textMuted : theme.textSecondary }]}
        numberOfLines={1}>
        {formatTime(event)}
      </ThemedText>

      <CurrencyBadge currency={event.currency} />
      <ImpactMark impact={event.impact} />

      <View style={styles.titleWrap}>
        <ThemedText
          style={[styles.title, { color: past && !event.released ? theme.textSecondary : theme.text }]}
          numberOfLines={2}>
          {event.title}
        </ThemedText>
        {event.revision ? (
          <ThemedText type="small" style={[styles.revision, { color: theme.warning }]} numberOfLines={1}>
            revised from {event.revision}
          </ThemedText>
        ) : null}
      </View>

      <View style={styles.values}>
        <ThemedText
          style={[styles.actual, { color: event.actual ? actualColor : theme.textMuted }]}
          numberOfLines={1}>
          {event.actual ?? '·'}
        </ThemedText>
        <View style={styles.secondaryValues}>
          {/* Before a print the forecast is the number being traded, so it
              outranks the previous value; afterwards both are just context. */}
          <ThemedText
            style={[
              styles.secondary,
              { color: event.released ? theme.textMuted : theme.textSecondary },
            ]}
            numberOfLines={1}>
            {event.forecast ?? '·'}
          </ThemedText>
          <ThemedText style={[styles.secondary, { color: theme.textMuted }]} numberOfLines={1}>
            {event.previous ?? '·'}
          </ThemedText>
        </View>
      </View>
    </Tap>
  );
}

export const EventRow = memo(EventRowComponent);

/** Column captions, rendered once per day instead of once per row. */
export function ValueLegend() {
  const theme = useTheme();
  return (
    <View style={styles.legend}>
      <ThemedText style={[styles.legendText, { color: theme.textMuted }]}>Actual</ThemedText>
      <View style={styles.legendPair}>
        <ThemedText style={[styles.legendText, { color: theme.textMuted }]}>Fcst</ThemedText>
        <ThemedText style={[styles.legendText, { color: theme.textMuted }]}>Prev</ThemedText>
      </View>
    </View>
  );
}

export const VALUES_WIDTH = 104;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 52,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  nextRail: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 2,
    borderTopRightRadius: Radius.full,
    borderBottomRightRadius: Radius.full,
  },
  time: {
    width: 40,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  titleWrap: { flex: 1, gap: 1 },
  title: { fontSize: 13, lineHeight: 17, fontWeight: '600', letterSpacing: -0.1 },
  revision: { fontSize: 10, lineHeight: 13, fontWeight: '600' },
  values: { width: VALUES_WIDTH, alignItems: 'flex-end', gap: 1 },
  actual: { fontSize: 13, lineHeight: 17, fontWeight: '800', fontVariant: ['tabular-nums'] },
  secondaryValues: { flexDirection: 'row', gap: Spacing.three },
  secondary: {
    minWidth: 44,
    textAlign: 'right',
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  legend: {
    width: VALUES_WIDTH,
    alignItems: 'flex-end',
    gap: 1,
  },
  legendPair: { flexDirection: 'row', gap: Spacing.three },
  legendText: {
    minWidth: 44,
    textAlign: 'right',
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
});
