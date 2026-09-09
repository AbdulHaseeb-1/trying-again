import { Children, isValidElement, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { Tap } from '@/components/tap';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Apple's inset grouped list.
 *
 * The pieces that make it read as native rather than "rounded card with rows":
 * an uppercase footnote header outside the card, a 10pt corner radius, 44pt
 * minimum row height, and separators inset to where the label text starts
 * rather than running the full width.
 */
export function GroupedSection({
  header,
  footer,
  children,
}: {
  header?: string;
  footer?: string;
  children: ReactNode;
}) {
  const theme = useTheme();
  const rows = Children.toArray(children).filter(isValidElement);

  return (
    <View style={styles.section}>
      {header ? (
        <ThemedText style={[styles.header, { color: theme.textMuted }]}>
          {header.toUpperCase()}
        </ThemedText>
      ) : null}

      <View style={[styles.card, { backgroundColor: theme.groupedCard }]}>
        {rows.map((row, index) => (
          <View key={row.key ?? index}>
            {index > 0 ? (
              <View style={[styles.separator, { backgroundColor: theme.separator }]} />
            ) : null}
            {row}
          </View>
        ))}
      </View>

      {footer ? (
        <ThemedText style={[styles.footer, { color: theme.textMuted }]}>{footer}</ThemedText>
      ) : null}
    </View>
  );
}

export function GroupedRow({
  label,
  value,
  detail,
  accessory,
  tint,
  onPress,
}: {
  label: string;
  value?: string | null;
  /** Secondary line under the value, e.g. a revision note. */
  detail?: string | null;
  /** Rendered instead of the value text — impact bars, a badge, a switch. */
  accessory?: ReactNode;
  tint?: string;
  onPress?: () => void;
}) {
  const theme = useTheme();

  const body = (
    <View style={styles.row}>
      <ThemedText style={styles.label} numberOfLines={1}>
        {label}
      </ThemedText>
      <View style={styles.trailing}>
        {accessory ?? (
          <ThemedText
            style={[styles.value, { color: tint ?? theme.textSecondary }]}
            numberOfLines={1}>
            {value ?? '—'}
          </ThemedText>
        )}
        {detail ? (
          <ThemedText style={[styles.detail, { color: theme.textMuted }]} numberOfLines={1}>
            {detail}
          </ThemedText>
        ) : null}
      </View>
      {onPress ? <AppIcon name="chevron" size={15} color={theme.textMuted} /> : null}
    </View>
  );

  if (!onPress) return body;
  return (
    <Tap accessibilityRole="button" accessibilityLabel={`${label} ${value ?? ''}`.trim()} onPress={onPress} haptic="none">
      {body}
    </Tap>
  );
}

const styles = StyleSheet.create({
  section: { gap: 7 },
  header: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '500',
    letterSpacing: 0.5,
    paddingHorizontal: Spacing.five,
  },
  card: { borderRadius: 10, overflow: 'hidden' },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: Spacing.five },
  row: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.five,
    paddingVertical: 9,
  },
  label: { flex: 1, fontSize: 16, lineHeight: 21, fontWeight: '400' },
  trailing: { alignItems: 'flex-end', gap: 1 },
  value: { fontSize: 16, lineHeight: 21, fontWeight: '500', fontVariant: ['tabular-nums'] },
  detail: { fontSize: 12, lineHeight: 15, fontWeight: '500' },
  footer: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400',
    paddingHorizontal: Spacing.five,
    paddingTop: 1,
  },
});
