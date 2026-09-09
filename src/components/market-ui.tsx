import { useId, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';

import { AppIcon, type IconName } from '@/components/app-icon';
import { AssetIcon } from '@/components/asset-icon';
import { Tap } from '@/components/tap';
import { ThemedText } from '@/components/themed-text';
import type { MarketAsset, Tone } from '@/data/market';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function toneColor(theme: ReturnType<typeof useTheme>, tone: Tone) {
  if (tone === 'positive') return theme.positive;
  if (tone === 'negative') return theme.negative;
  if (tone === 'warning') return theme.warning;
  return theme.textSecondary;
}

export function AppHeader({
  title = 'MarketPulse',
  onSearch,
  onFilter,
  onSettings,
}: {
  title?: string;
  onSearch?: () => void;
  onFilter?: () => void;
  onSettings?: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.header}>
      <ThemedText style={styles.brand}>{title}</ThemedText>
      <View style={styles.headerActions}>
        {onSearch ? <HeaderButton label="Search" icon="search" onPress={onSearch} /> : null}
        {onFilter ? <HeaderButton label="Filter" icon="filter" onPress={onFilter} /> : null}
        {onSettings ? <HeaderButton label="Settings" icon="settings" onPress={onSettings} /> : null}
      </View>
    </View>
  );
}

function HeaderButton({ label, icon, onPress }: { label: string; icon: IconName; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Tap accessibilityRole="button" accessibilityLabel={label} onPress={onPress} haptic="none" style={styles.headerButton}>
      <AppIcon name={icon} color={theme.textSecondary} />
    </Tap>
  );
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const theme = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <ThemedText style={styles.sectionTitle}>{title}</ThemedText>
      {action && onAction ? (
        <Tap accessibilityRole="button" onPress={onAction} style={styles.sectionAction}>
          <ThemedText type="small" themeColor="textSecondary">{action}</ThemedText>
          <AppIcon name="chevron" size={16} color={theme.textMuted} />
        </Tap>
      ) : null}
    </View>
  );
}

export function FilterChips({ items, value, onChange }: { items: string[]; value: string; onChange: (item: string) => void }) {
  const theme = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipList}>
      {items.map((item) => {
        const selected = item === value;
        return (
          <Tap
            key={item}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(item)}
            style={[
              styles.chip,
              { borderColor: selected ? `${theme.primary}66` : theme.border, backgroundColor: selected ? `${theme.primary}1A` : theme.surface },
            ]}>
            <ThemedText type="small" themeColor={selected ? 'primary' : 'textSecondary'} style={styles.chipText}>{item}</ThemedText>
          </Tap>
        );
      })}
    </ScrollView>
  );
}

export function ImpactBadge({ impact, tone }: { impact: string; tone: Tone }) {
  const theme = useTheme();
  const color = toneColor(theme, tone);
  return (
    <View style={[styles.impact, { backgroundColor: `${color}1C` }]}>
      <View style={[styles.impactDot, { backgroundColor: color }]} />
      <ThemedText style={[styles.impactText, { color }]}>{impact}</ThemedText>
    </View>
  );
}

export function MarketTicker({ assets, onAssetPress }: { assets: MarketAsset[]; onAssetPress: (asset: MarketAsset) => void }) {
  const theme = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tickerList}>
      {assets.map((asset, index) => (
        <Tap
          key={asset.symbol}
          accessibilityRole="button"
          accessibilityLabel={`Open ${asset.name}`}
          onPress={() => onAssetPress(asset)}
          style={[styles.ticker, index !== assets.length - 1 && { borderRightColor: theme.border, borderRightWidth: StyleSheet.hairlineWidth }]}>
          <View style={styles.tickerAsset}><AssetIcon symbol={asset.symbol} size={18} /><ThemedText type="small" themeColor="textSecondary">{asset.symbol}</ThemedText></View>
          <View style={styles.tickerNumbers}>
            <ThemedText style={styles.tickerPrice}>{asset.price}</ThemedText>
            <ThemedText style={[styles.tickerChange, { color: toneColor(theme, asset.tone) }]}>{asset.change}</ThemedText>
          </View>
        </Tap>
      ))}
    </ScrollView>
  );
}

export function Sparkline({ points, tone = 'positive', width = 66, height = 26 }: { points: number[]; tone?: Tone; width?: number; height?: number }) {
  const theme = useTheme();
  const color = toneColor(theme, tone);
  const gradientId = `spark-${useId().replace(/:/g, '')}`;
  const coordinates = chartPoints(points.slice(-12), width, height, 2, 2);
  const line = smoothPath(coordinates);
  return (
    <Svg accessibilityRole="image" accessibilityLabel="Market trend chart" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Defs>
        <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.28} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path d={areaPath(line, coordinates, height - 1)} fill={`url(#${gradientId})`} />
      <Path d={line} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      {coordinates.length ? <Circle cx={coordinates.at(-1)?.x} cy={coordinates.at(-1)?.y} r={2.2} fill={color} /> : null}
    </Svg>
  );
}

export function LineChart({ points, tone = 'positive', height = 148 }: { points: number[]; tone?: Tone; height?: number }) {
  const theme = useTheme();
  const color = toneColor(theme, tone);
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const gradientId = `chart-${useId().replace(/:/g, '')}`;
  const measure = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  const left = 4;
  const right = 34;
  const coordinates = width ? chartPoints(points, width, height, left, right) : [];
  const line = smoothPath(coordinates);
  const max = Math.max(...points);
  const min = Math.min(...points);
  const middle = (max + min) / 2;
  const current = coordinates[selected ?? coordinates.length - 1];
  const select = (event: GestureResponderEvent) => {
    if (!coordinates.length) return;
    const ratio = (event.nativeEvent.locationX - left) / Math.max(width - left - right, 1);
    setSelected(Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))));
  };
  const tooltipX = current ? Math.max(4, Math.min(current.x - 30, width - 70)) : 0;
  const chartTooltip = selected !== null && current ? (
    <>
      <Line x1={current.x} y1={0} x2={current.x} y2={height} stroke={theme.borderStrong} strokeWidth={1} strokeDasharray="3 4" />
      <Circle cx={current.x} cy={current.y} r={5} fill={theme.background} stroke={color} strokeWidth={2.5} />
      <Rect x={tooltipX} y={6} width={64} height={26} rx={7} fill={theme.surfaceVariant} stroke={theme.borderStrong} />
      <SvgText x={tooltipX + 32} y={23} fill={theme.text} fontSize={11} fontWeight="700" textAnchor="middle">{points[selected].toFixed(1)}</SvgText>
    </>
  ) : null;

  return (
    <Pressable
      accessibilityRole="image"
      accessibilityLabel={`Interactive price chart. Latest value ${points.at(-1)?.toFixed(1) ?? 'unavailable'}`}
      onLayout={measure}
      onPressIn={select}
      onTouchMove={select}
      onPressOut={() => setSelected(null)}
      style={[styles.lineChart, { height, borderColor: theme.border }]}>
      {width ? (
        <Svg pointerEvents="none" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={0.3} />
              <Stop offset="0.7" stopColor={color} stopOpacity={0.06} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {[0.08, 0.38, 0.68, 0.98].map((position) => (
            <Line key={`h-${position}`} x1={left} y1={height * position} x2={width - right} y2={height * position} stroke={theme.border} strokeWidth={1} />
          ))}
          {[0.25, 0.5, 0.75].map((position) => (
            <Line key={`v-${position}`} x1={(width - right) * position} y1={0} x2={(width - right) * position} y2={height} stroke={theme.border} strokeWidth={1} />
          ))}
          <Path d={areaPath(line, coordinates, height)} fill={`url(#${gradientId})`} />
          <Path d={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          {current ? <Circle cx={coordinates.at(-1)?.x} cy={coordinates.at(-1)?.y} r={3.5} fill={theme.background} stroke={color} strokeWidth={2} /> : null}
          <SvgText x={width - 2} y={12} fill={theme.textMuted} fontSize={9} fontWeight="600" textAnchor="end">{max.toFixed(0)}</SvgText>
          <SvgText x={width - 2} y={height / 2 + 4} fill={theme.textMuted} fontSize={9} fontWeight="600" textAnchor="end">{middle.toFixed(0)}</SvgText>
          <SvgText x={width - 2} y={height - 3} fill={theme.textMuted} fontSize={9} fontWeight="600" textAnchor="end">{min.toFixed(0)}</SvgText>
          {chartTooltip}
        </Svg>
      ) : null}
    </Pressable>
  );
}

type ChartPoint = { x: number; y: number };

function chartPoints(points: number[], width: number, height: number, left: number, right: number): ChartPoint[] {
  if (!points.length) return [];
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = Math.max(max - min, 1);
  const xStep = points.length > 1 ? (width - left - right) / (points.length - 1) : 0;
  return points.map((point, index) => ({
    x: left + index * xStep,
    y: 5 + ((max - point) / range) * (height - 12),
  }));
}

function smoothPath(points: ChartPoint[]): string {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  return points.slice(0, -1).reduce((path, point, index) => {
    const previous = points[index - 1] ?? point;
    const next = points[index + 1];
    const after = points[index + 2] ?? next;
    const cp1x = point.x + (next.x - previous.x) / 6;
    const cp1y = point.y + (next.y - previous.y) / 6;
    const cp2x = next.x - (after.x - point.x) / 6;
    const cp2y = next.y - (after.y - point.y) / 6;
    return `${path} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${next.x} ${next.y}`;
  }, `M ${points[0].x} ${points[0].y}`);
}

function areaPath(line: string, points: ChartPoint[], bottom: number): string {
  if (!line || !points.length) return '';
  return `${line} L ${points.at(-1)?.x} ${bottom} L ${points[0].x} ${bottom} Z`;
}

export function MetricTile({ label, value, note, tone = 'neutral' }: { label: string; value: string; note: string; tone?: Tone }) {
  const theme = useTheme();
  return (
    <View style={styles.metricTile}>
      <ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>
      <ThemedText style={styles.metricValue}>{value}</ThemedText>
      <ThemedText type="small" style={{ color: toneColor(theme, tone) }}>{note}</ThemedText>
    </View>
  );
}

export function MarketRow({ asset, onPress, onWatch }: { asset: MarketAsset; onPress: () => void; onWatch?: () => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.marketRow, { borderBottomColor: theme.border }]}>
      <Tap accessibilityRole="button" accessibilityLabel={`Open ${asset.name}`} onPress={onPress} style={styles.rowMain}>
        <View style={styles.assetMark}><AssetIcon symbol={asset.symbol} /></View>
        <View style={styles.assetName}>
          <ThemedText style={styles.symbol}>{asset.symbol}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">{asset.name}</ThemedText>
        </View>
        <View style={styles.marketTrend}><Sparkline points={asset.points} tone={asset.tone} /></View>
        <View style={styles.marketPrice}>
          <ThemedText style={styles.priceText}>{asset.price}</ThemedText>
          <ThemedText type="small" style={{ color: toneColor(theme, asset.tone) }}>{asset.change}</ThemedText>
        </View>
      </Tap>
      {onWatch ? <Tap accessibilityRole="button" accessibilityLabel={`Watch ${asset.symbol}`} onPress={onWatch} style={styles.watchButton}><AppIcon name="watch" size={16} color={theme.textMuted} /></Tap> : null}
    </View>
  );
}

export function EmptyState({ icon = 'alerts', title, body, action, onAction }: { icon?: IconName; title: string; body: string; action?: string; onAction?: () => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.empty, { borderColor: theme.border, backgroundColor: theme.surface }]}>
      <View style={styles.emptyIcon}><AppIcon name={icon} color={theme.primary} /></View>
      <ThemedText style={styles.emptyTitle}>{title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.emptyBody}>{body}</ThemedText>
      {action && onAction ? <Tap accessibilityRole="button" onPress={onAction} style={[styles.primaryButton, { backgroundColor: theme.primary }]}><ThemedText type="smallBold" style={{ color: theme.background }}>{action}</ThemedText></Tap> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 },
  brand: { fontSize: 22, lineHeight: 27, fontWeight: '700', letterSpacing: -0.5 },
  headerActions: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
  headerButton: { alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: Radius.md },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
  sectionTitle: { fontSize: 16, lineHeight: 21, fontWeight: '700', letterSpacing: -0.2 },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: Spacing.half },
  chipList: { gap: Spacing.two, paddingVertical: Spacing.one },
  chip: { paddingHorizontal: Spacing.three, minHeight: 30, justifyContent: 'center', borderRadius: Radius.md, borderWidth: StyleSheet.hairlineWidth },
  chipText: { fontSize: 12 },
  impact: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: Spacing.two, paddingVertical: 4, borderRadius: Radius.full },
  impactDot: { width: 5, height: 5, borderRadius: Radius.full },
  impactText: { fontSize: 10, lineHeight: 13, fontWeight: '700', letterSpacing: 0.5 },
  tickerList: { paddingVertical: Spacing.two },
  ticker: { minWidth: 106, paddingHorizontal: Spacing.three, gap: Spacing.one },
  tickerAsset: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tickerNumbers: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  tickerPrice: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  tickerChange: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  lineChart: { position: 'relative', overflow: 'hidden', borderBottomWidth: StyleSheet.hairlineWidth },
  metricTile: { flex: 1, minWidth: '45%', gap: 2 },
  metricValue: { fontSize: 18, lineHeight: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  marketRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  assetMark: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.md },
  assetName: { flex: 1.2, gap: 1 },
  symbol: { fontSize: 14, lineHeight: 18, fontWeight: '700' },
  marketTrend: { flex: 1, alignItems: 'center' },
  marketPrice: { minWidth: 58, alignItems: 'flex-end', gap: 1 },
  priceText: { fontSize: 13, lineHeight: 17, fontWeight: '700', fontVariant: ['tabular-nums'] },
  watchButton: { padding: Spacing.one },
  empty: { alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.lg, padding: Spacing.six, gap: Spacing.two },
  emptyIcon: { width: 42, height: 42, borderRadius: Radius.lg, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.one },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptyBody: { textAlign: 'center', maxWidth: 260 },
  primaryButton: { borderRadius: Radius.md, paddingHorizontal: Spacing.four, paddingVertical: Spacing.three, marginTop: Spacing.two },
});
