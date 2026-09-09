import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Stable per-currency tint so the eye can track one currency down the list. */
const HUES: Record<string, string> = {
  USD: '#38BDF8',
  EUR: '#818CF8',
  GBP: '#F472B6',
  JPY: '#FB923C',
  AUD: '#34D399',
  NZD: '#2DD4BF',
  CAD: '#F87171',
  CHF: '#A78BFA',
  CNY: '#FBBF24',
};

export function currencyColor(currency: string, fallback: string): string {
  return HUES[currency.toUpperCase()] ?? fallback;
}

export function CurrencyBadge({ currency }: { currency: string }) {
  const theme = useTheme();
  const color = currencyColor(currency, theme.textSecondary);
  return (
    <View style={[styles.badge, { backgroundColor: `${color}1F` }]}>
      <ThemedText style={[styles.text, { color }]}>{currency}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 40,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: Radius.sm,
    alignItems: 'center',
  },
  text: { fontSize: 11, lineHeight: 14, fontWeight: '800', letterSpacing: 0.3 },
});
