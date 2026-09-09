import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { AppIcon } from '@/components/app-icon';
import { AssetIcon } from '@/components/asset-icon';
import { FilterChips, LineChart, MetricTile, Sparkline, toneColor } from '@/components/market-ui';
import { Tap } from '@/components/tap';
import { TabSwipe } from '@/components/tab-swipe';
import { ThemedText } from '@/components/themed-text';
import { derivativeMetrics, detailSeries, marketAssets } from '@/data/market';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const timeframes = ['1H', '4H', '1D', '1W', '1M'];

export default function AssetDetailScreen() {
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const router = useRouter();
  const theme = useTheme();
  const [timeframe, setTimeframe] = useState('1D');
  const [watching, setWatching] = useState(false);
  const asset = useMemo(() => {
    const wanted = String(symbol).toUpperCase();
    return marketAssets.find((item) => item.symbol.toUpperCase() === wanted) ?? marketAssets[0];
  }, [symbol]);
  const color = toneColor(theme, asset.tone);
  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <TabSwipe>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.nav}>
          <Tap accessibilityRole="button" accessibilityLabel="Back" onPress={goBack} style={styles.navButton}><AppIcon name="back" color={theme.textSecondary} /></Tap>
          <ThemedText style={styles.navTitle}>{asset.symbol}</ThemedText>
          <Tap accessibilityRole="button" accessibilityLabel="Watch asset" onPress={() => setWatching((value) => !value)} style={styles.navButton}><AppIcon name="watch" color={watching ? theme.warning : theme.textSecondary} /></Tap>
        </View>
        <View style={styles.assetHero}>
          <View style={styles.assetMark}><AssetIcon symbol={asset.symbol} size={40} /></View>
          <View style={{ flex: 1 }}><ThemedText style={styles.symbol}>{asset.symbol}</ThemedText><ThemedText type="small" themeColor="textSecondary">{asset.name}</ThemedText></View>
          <View style={{ alignItems: 'flex-end' }}><ThemedText style={styles.assetPrice}>{asset.price}</ThemedText><ThemedText type="smallBold" style={{ color }}>{asset.change}</ThemedText></View>
        </View>
        <FilterChips items={timeframes} value={timeframe} onChange={setTimeframe} />
        <View style={[styles.chartCard, { borderColor: theme.border, backgroundColor: theme.surface }]}>
          <View style={styles.chartTop}><ThemedText type="small" themeColor="textSecondary">{timeframe} price action</ThemedText><View style={styles.sentiment}><View style={[styles.sentimentDot, { backgroundColor: color }]} /><ThemedText type="smallBold" style={{ color }}>{asset.sentiment}</ThemedText></View></View>
          <LineChart points={detailSeries} tone={asset.tone} />
          <View style={styles.chartLabels}><ThemedText type="small" themeColor="textMuted">09:00</ThemedText><ThemedText type="small" themeColor="textMuted">13:00</ThemedText><ThemedText type="small" themeColor="textMuted">Now</ThemedText></View>
        </View>
        <View style={styles.metrics}><MetricTile label="Open Interest" value="$34.2B" note="+6.2%" tone="positive" /><MetricTile label="Funding Rate" value="0.010%" note="Balanced" tone="positive" /><MetricTile label="24H Volume" value="$42.7B" note="Across venues" /><MetricTile label="Long / Short" value="62% / 38%" note="Longs higher" tone="warning" /></View>
        <View style={[styles.insight, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <View style={styles.insightTop}><View style={styles.aiIcon}><AppIcon name="sparkles" color={theme.primary} /></View><ThemedText style={styles.insightLabel}>AI ANALYSIS</ThemedText></View>
          <ThemedText style={styles.insightTitle}>Leverage expansion</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">Price and open interest are increasing together. This can indicate new leveraged exposure entering the market, not a guarantee of direction.</ThemedText>
          <View style={styles.interpretation}><View><ThemedText type="small" themeColor="textMuted">Price</ThemedText><ThemedText type="smallBold" style={{ color }}>↑ Rising</ThemedText></View><View><ThemedText type="small" themeColor="textMuted">Open interest</ThemedText><ThemedText type="smallBold" style={{ color: theme.positive }}>↑ Building</ThemedText></View><Sparkline points={asset.points} tone={asset.tone} /></View>
        </View>
      </ScrollView>
      </TabSwipe>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: Spacing.four, paddingTop: Spacing.four, paddingBottom: Spacing.eight, gap: Spacing.four },
  nav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  navButton: { width: 34, height: 34, justifyContent: 'center', alignItems: 'center', borderRadius: Radius.md },
  navTitle: { fontSize: 16, fontWeight: '700' },
  assetHero: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingTop: Spacing.two },
  assetMark: { width: 38, height: 38, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  symbol: { fontSize: 18, lineHeight: 22, fontWeight: '700' },
  assetPrice: { fontSize: 19, lineHeight: 24, fontWeight: '700', fontVariant: ['tabular-nums'] },
  chartCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.lg, padding: Spacing.four, gap: Spacing.three },
  chartTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sentiment: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  sentimentDot: { width: 6, height: 6, borderRadius: Radius.full },
  chartLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', rowGap: Spacing.five },
  insight: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.lg, padding: Spacing.four, gap: Spacing.three },
  insightTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  aiIcon: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.sm },
  insightLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  insightTitle: { fontSize: 18, lineHeight: 23, fontWeight: '700' },
  interpretation: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: Spacing.one },
});
