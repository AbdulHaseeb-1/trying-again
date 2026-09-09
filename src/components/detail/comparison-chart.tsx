import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { ComparisonBar } from '@/components/detail/value-comparison';
import { useTheme } from '@/hooks/use-theme';

const HEIGHT = 104;
const MIN_BAR = 3;

/**
 * Previous / forecast / actual as three bars on a shared scale.
 *
 * A series that crosses zero is drawn against a continuous zero axis, with
 * negative bars hanging below it. Measuring everything from the series floor
 * instead would draw a −1.1% print as a sliver beside full-height positives,
 * which reads as "barely moved" rather than "went negative".
 *
 * A series that stays on one side of zero is measured from a padded floor, so
 * a set like 2.7 / 2.8 / 2.9 still shows a visible difference instead of three
 * identical full-height bars.
 */
export function ComparisonChart({ bars, tone }: { bars: ComparisonBar[]; tone: string }) {
  const theme = useTheme();
  const values = bars.map((bar) => bar.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const spansZero = min < 0 && max > 0;

  const span = Math.max(max - min, Number.EPSILON);
  const aboveHeight = spansZero ? (max / span) * HEIGHT : HEIGHT;
  const belowHeight = HEIGHT - aboveHeight;

  const floor = max === min ? min - Math.abs(min || 1) : min - (max - min) * 0.35;
  const floorRange = Math.max(max - floor, Number.EPSILON);

  const heightFor = (value: number, negative: boolean) => {
    if (!spansZero) return Math.max(MIN_BAR, ((value - floor) / floorRange) * HEIGHT);
    const extent = negative ? Math.abs(min) : max;
    return Math.max(MIN_BAR, (Math.abs(value) / Math.max(extent, Number.EPSILON)) * (negative ? belowHeight : aboveHeight));
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {bars.map((bar) => (
          <ThemedText
            key={bar.kind}
            style={[
              styles.value,
              { color: bar.kind === 'actual' ? tone : theme.textSecondary },
            ]}
            numberOfLines={1}>
            {bar.raw}
          </ThemedText>
        ))}
      </View>

      <View style={[styles.plot, { height: HEIGHT }]}>
        {/* One axis across the whole plot, so the stubs above it read as small
            positives rather than bars floating in space. */}
        {spansZero ? (
          <View style={[styles.axis, { top: aboveHeight, backgroundColor: theme.borderStrong }]} />
        ) : null}

        <View style={styles.columns}>
          {bars.map((bar) => {
            const isActual = bar.kind === 'actual';
            const negative = spansZero && bar.value < 0;
            const fill = isActual ? tone : theme.neutralBar;
            const height = heightFor(bar.value, negative);

            return (
              <View key={bar.kind} style={styles.column}>
                <View style={[styles.slot, { height: aboveHeight, justifyContent: 'flex-end' }]}>
                  {!negative ? (
                    <View style={[styles.bar, styles.barUp, { height, backgroundColor: fill }]} />
                  ) : null}
                </View>
                <View style={[styles.slot, { height: belowHeight }]}>
                  {negative ? (
                    <View style={[styles.bar, styles.barDown, { height, backgroundColor: fill }]} />
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.row}>
        {bars.map((bar) => (
          <ThemedText key={bar.kind} style={[styles.label, { color: theme.textMuted }]} numberOfLines={1}>
            {bar.label}
          </ThemedText>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 7 },
  row: { flexDirection: 'row', gap: Spacing.four },
  plot: { position: 'relative' },
  axis: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth },
  columns: { flexDirection: 'row', gap: Spacing.four, height: '100%' },
  column: { flex: 1 },
  slot: { width: '100%' },
  bar: { width: '100%' },
  barUp: { borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  barDown: { borderBottomLeftRadius: 6, borderBottomRightRadius: 6 },
  value: { flex: 1, textAlign: 'center', fontSize: 14, lineHeight: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  label: { flex: 1, textAlign: 'center', fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.3 },
});
