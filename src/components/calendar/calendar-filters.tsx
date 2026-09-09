import { ScrollView, StyleSheet, View } from 'react-native';

import { Tap } from '@/components/tap';
import { ThemedText } from '@/components/themed-text';
import { currencyColor } from '@/components/calendar/currency-badge';
import { Radius, Spacing } from '@/constants/theme';
import { CURRENCY_FILTERS, IMPACT_FILTERS, type Impact } from '@/data/calendar';
import { useTheme } from '@/hooks/use-theme';

export type CalendarFilterState = {
  minImpact: Impact | null;
  currencies: string[];
};

/**
 * The screen's only filtering surface.
 *
 * The previous News screen offered a chip row *and* a bottom sheet that set
 * overlapping things; this replaces both. Impact is a segmented control
 * (mutually exclusive), currency is multi-select — the control shape tells you
 * which is which without any explanatory copy.
 */
export function CalendarFilters({
  value,
  onChange,
}: {
  value: CalendarFilterState;
  onChange: (next: CalendarFilterState) => void;
}) {
  const theme = useTheme();

  const toggleCurrency = (code: string) => {
    const selected = value.currencies.includes(code);
    onChange({
      ...value,
      currencies: selected
        ? value.currencies.filter((entry) => entry !== code)
        : [...value.currencies, code],
    });
  };

  return (
    <View style={styles.root}>
      <View style={[styles.segment, { backgroundColor: theme.surfaceVariant }]}>
        {IMPACT_FILTERS.map((option) => {
          const selected = value.minImpact === option.value;
          return (
            <Tap
              key={option.label}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${option.label} impact`}
              onPress={() => onChange({ ...value, minImpact: option.value })}
              haptic="none"
              style={[styles.segmentItem, selected && { backgroundColor: theme.card }]}>
              <ThemedText
                style={[styles.segmentText, { color: selected ? theme.text : theme.textMuted }]}>
                {option.label}
              </ThemedText>
            </Tap>
          );
        })}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}>
        {value.currencies.length > 0 ? (
          <Tap
            accessibilityRole="button"
            accessibilityLabel="Clear currency filter"
            onPress={() => onChange({ ...value, currencies: [] })}
            haptic="none"
            style={[styles.chip, { borderColor: theme.borderStrong, backgroundColor: theme.surface }]}>
            <ThemedText style={[styles.chipText, { color: theme.textSecondary }]}>Clear</ThemedText>
          </Tap>
        ) : null}

        {CURRENCY_FILTERS.map((code) => {
          const selected = value.currencies.includes(code);
          const color = currencyColor(code, theme.primary);
          return (
            <Tap
              key={code}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => toggleCurrency(code)}
              haptic="none"
              style={[
                styles.chip,
                {
                  borderColor: selected ? `${color}80` : theme.border,
                  backgroundColor: selected ? `${color}1F` : theme.surface,
                },
              ]}>
              <ThemedText style={[styles.chipText, { color: selected ? color : theme.textSecondary }]}>
                {code}
              </ThemedText>
            </Tap>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: Spacing.two },
  segment: { flexDirection: 'row', padding: 2, borderRadius: Radius.md, gap: 2 },
  segmentItem: {
    flex: 1,
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.sm,
  },
  segmentText: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
  chips: { gap: Spacing.two, paddingVertical: 1 },
  chip: {
    minHeight: 28,
    paddingHorizontal: Spacing.three,
    justifyContent: 'center',
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: { fontSize: 11, lineHeight: 15, fontWeight: '700', letterSpacing: 0.2 },
});
