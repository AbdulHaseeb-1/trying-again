import { StyleSheet, View } from 'react-native';

import { Radius } from '@/constants/theme';
import type { Impact } from '@/data/calendar';
import { useTheme } from '@/hooks/use-theme';

/**
 * Impact as three stacked bars — the shape traders already read on
 * ForexFactory. It carries the same information as a coloured word badge in a
 * quarter of the width, which is what lets each row stay a single line.
 */
export function ImpactMark({ impact, size = 'default' }: { impact: Impact; size?: 'default' | 'large' }) {
  const theme = useTheme();
  const filled = impact === 'high' ? 3 : impact === 'medium' ? 2 : impact === 'low' ? 1 : 0;
  const color = impactColor(theme, impact);
  const unit = size === 'large' ? 4 : 3;

  return (
    // Decorative: every place this appears already announces the impact, either
    // in the row's own label or in adjacent text. Announcing it twice is noise.
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.marks, { gap: unit === 4 ? 3 : 2 }]}>
      {[0, 1, 2].map((index) => (
        <View
          key={index}
          style={[
            styles.mark,
            {
              width: unit,
              height: unit * 2 + index * unit,
              backgroundColor: index < filled ? color : theme.borderStrong,
            },
          ]}
        />
      ))}
    </View>
  );
}

export function impactColor(theme: ReturnType<typeof useTheme>, impact: Impact): string {
  if (impact === 'high') return theme.negative;
  if (impact === 'medium') return theme.warning;
  if (impact === 'low') return theme.secondary;
  return theme.textMuted;
}

export function impactLabel(impact: Impact): string {
  return impact === 'holiday' ? 'Holiday' : `${impact[0].toUpperCase()}${impact.slice(1)}`;
}

const styles = StyleSheet.create({
  marks: { flexDirection: 'row', alignItems: 'flex-end' },
  mark: { borderRadius: Radius.sm },
});
