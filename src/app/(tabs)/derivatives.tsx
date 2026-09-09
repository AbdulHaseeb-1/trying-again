import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { BottomSheet } from '@/components/bottom-sheet';
import { FilterChips, LineChart, MetricTile, SectionHeader } from '@/components/market-ui';
import { Tap } from '@/components/tap';
import { ThemedText } from '@/components/themed-text';
import { detailSeries } from '@/data/market';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const views = ['Overview', 'Open Interest', 'Funding', 'Liquidations', 'Positioning'];
const timeframes = ['1D', '7D', '30D', '3M', '1Y'];

export default function DerivativesScreen() {
  const theme = useTheme();
  const [asset, setAsset] = useState('BTC');
  const [view, setView] = useState('Overview');
  const [timeframe, setTimeframe] = useState('7D');
  const [selectorOpen, setSelectorOpen] = useState(false);

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}><ThemedText style={styles.title}>Derivatives</ThemedText><Tap accessibilityRole="button" onPress={() => setSelectorOpen(true)} style={[styles.assetSelect, { borderColor: theme.border, backgroundColor: theme.surface }]}><ThemedText type="smallBold">{asset}</ThemedText><AppIcon name="chevron" size={16} color={theme.textMuted} /></Tap></View>
        <FilterChips items={views} value={view} onChange={setView} />
        <View style={styles.keyMetric}><ThemedText type="small" themeColor="textSecondary">{view === 'Funding' ? 'Current funding' : view === 'Liquidations' ? '24H liquidations' : 'Open interest'}</ThemedText><View style={styles.metricLine}><ThemedText style={styles.metricValue}>{view === 'Funding' ? '0.010%' : view === 'Liquidations' ? '$428M' : '$36.7B'}</ThemedText><ThemedText type="smallBold" style={{ color: theme.positive }}>{view === 'Funding' ? 'Healthy' : '+4.8%'}</ThemedText></View></View>
        <View style={[styles.chartCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.chartHeader}><ThemedText style={styles.chartTitle}>{view === 'Funding' ? 'Funding trend' : view === 'Liquidations' ? 'Liquidation pressure' : 'Price vs. open interest'}</ThemedText><ThemedText type="small" themeColor="textSecondary">{timeframe}</ThemedText></View>
          <LineChart points={detailSeries} tone={view === 'Liquidations' ? 'negative' : 'positive'} />
          <FilterChips items={timeframes} value={timeframe} onChange={setTimeframe} />
        </View>
        <View style={styles.grid}><MetricTile label="24H Volume" value="$42.7B" note="+9.4%" tone="positive" /><MetricTile label="Annualized funding" value="10.95%" note="Moderate" tone="warning" /><MetricTile label="Long liquidations" value="$271M" note="63% of total" tone="negative" /><MetricTile label="Short liquidations" value="$157M" note="37% of total" /></View>
        <View style={[styles.positionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <SectionHeader title="Long / Short positioning" />
          <ThemedText type="small" themeColor="textSecondary">Global accounts</ThemedText>
          <View style={styles.distributionLabels}><ThemedText type="smallBold" style={{ color: theme.positive }}>LONG 58.2%</ThemedText><ThemedText type="smallBold" style={{ color: theme.negative }}>SHORT 41.8%</ThemedText></View>
          <View style={[styles.distribution, { backgroundColor: `${theme.negative}50` }]}><View style={[styles.longFill, { width: '58.2%', backgroundColor: theme.positive }]} /></View>
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <View style={styles.positionRows}><PositionRow label="Top traders accounts" value="55.1% long" /><PositionRow label="Top traders positions" value="61.7% long" /></View>
        </View>
        <View style={[styles.insight, { borderColor: theme.border, backgroundColor: theme.surface }]}><AppIcon name="sparkles" color={theme.primary} /><View style={{ flex: 1 }}><ThemedText type="smallBold">AI market interpretation</ThemedText><ThemedText type="small" themeColor="textSecondary">Rising price with rising OI signals leverage expansion. Funding is positive but not yet extreme.</ThemedText></View></View>
      </ScrollView>
      <BottomSheet visible={selectorOpen} title="Select asset" onClose={() => setSelectorOpen(false)}>
        <View style={styles.sheetOptions}>{['BTC', 'ETH', 'SOL'].map((option) => <Tap key={option} accessibilityRole="button" onPress={() => { setAsset(option); setSelectorOpen(false); }} style={[styles.sheetOption, { borderBottomColor: theme.border }]}><ThemedText type="smallBold" style={{ color: asset === option ? theme.primary : theme.text }}>{option}</ThemedText>{asset === option ? <AppIcon name="eye" color={theme.primary} /> : <View />}</Tap>)}</View>
      </BottomSheet>
    </View>
  );
}

function PositionRow({ label, value }: { label: string; value: string }) { return <View style={styles.positionRow}><ThemedText type="small" themeColor="textSecondary">{label}</ThemedText><ThemedText type="smallBold">{value}</ThemedText></View>; }

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: Spacing.four, paddingTop: Spacing.four, paddingBottom: Spacing.eight, gap: Spacing.four },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 24, lineHeight: 29, fontWeight: '700', letterSpacing: -0.6 },
  assetSelect: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: Spacing.three, paddingRight: Spacing.two, minHeight: 32, borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth },
  keyMetric: { gap: Spacing.one },
  metricLine: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  metricValue: { fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.8, fontVariant: ['tabular-nums'] },
  chartCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.lg, padding: Spacing.four, gap: Spacing.three },
  chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chartTitle: { fontSize: 15, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: Spacing.five },
  positionCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.lg, padding: Spacing.four, gap: Spacing.three },
  distributionLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  distribution: { height: 10, overflow: 'hidden', borderRadius: Radius.full },
  longFill: { height: '100%', borderRadius: Radius.full },
  divider: { height: StyleSheet.hairlineWidth, width: '100%' },
  positionRows: { gap: Spacing.two },
  positionRow: { flexDirection: 'row', justifyContent: 'space-between' },
  insight: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three, borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.lg, padding: Spacing.four },
  sheetOptions: { gap: 0 },
  sheetOption: { height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth },
});
