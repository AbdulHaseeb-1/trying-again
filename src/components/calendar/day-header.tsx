import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ValueLegend } from '@/components/calendar/event-row';
import { Radius, Spacing } from '@/constants/theme';
import { formatDayLabel, todayKey } from '@/data/calendar';
import { useTheme } from '@/hooks/use-theme';

/**
 * Sticky day divider. It doubles as the column header for the value block,
 * which is why the row itself carries no labels.
 */
export function DayHeader({ date, count }: { date: string; count: number }) {
  const theme = useTheme();
  const isToday = date === todayKey();
  const label = formatDayLabel(date);

  return (
    <View style={[styles.header, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
      <View style={styles.left}>
        <ThemedText style={[styles.label, { color: isToday ? theme.primary : theme.text }]}>
          {label}
        </ThemedText>
        <View style={[styles.count, { backgroundColor: theme.surfaceVariant }]}>
          <ThemedText style={[styles.countText, { color: theme.textMuted }]}>{count}</ThemedText>
        </View>
      </View>
      <ValueLegend />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  label: { fontSize: 14, lineHeight: 18, fontWeight: '800', letterSpacing: -0.2 },
  count: {
    minWidth: 20,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: Radius.full,
    alignItems: 'center',
  },
  countText: { fontSize: 10, lineHeight: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
