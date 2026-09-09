import { useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { BottomSheet } from '@/components/bottom-sheet';
import { MarketSessionBanner, SessionVariantSheet, WorldClockSheet } from '@/components/market-session';
import { AppHeader, ImpactBadge, MetricTile, SectionHeader, toneColor } from '@/components/market-ui';
import { NewsActionSheet } from '@/components/news-actions';
import { NewsCard } from '@/components/news-item';
import { Tap } from '@/components/tap';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { derivativeMetrics, marketAssets, newsItems, type NewsItem } from '@/data/market';
import { useAppTheme, useTheme } from '@/hooks/use-theme';

export default function PulseScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { fontScale, setFontScale } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  const [reminded, setReminded] = useState(false);
  const [quickSheet, setQuickSheet] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sessionSheetOpen, setSessionSheetOpen] = useState(false);
  const [clockSheetOpen, setClockSheetOpen] = useState(false);
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);

  const openAsset = (symbol: string) => router.push({ pathname: '/asset/[symbol]', params: { symbol } });
  const refresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 650);
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 128 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.primary} />}>
        <AppHeader onSearch={() => setQuickSheet(true)} onSettings={() => setSettingsOpen(true)} />
        {/* <MarketTicker assets={tickerAssets} onAssetPress={(asset) => openAsset(asset.symbol)} /> */}

        <MarketSessionBanner
          onExploreVariants={() => setSessionSheetOpen(true)}
          onPressClock={() => setClockSheetOpen(true)}
        />

        <View style={styles.heroRow}>
          <View>
            <ThemedText style={styles.title}>Market Pulse</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">September 8, 2026</ThemedText>
          </View>
          <View style={[styles.live, { backgroundColor: `${theme.positive}16` }]}>
            <View style={[styles.liveDot, { backgroundColor: theme.positive }]} />
            <ThemedText type="smallBold" style={{ color: theme.positive }}>Live</ThemedText>
          </View>
        </View>

        <View style={[styles.eventCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.eventTopline}>
            <View style={styles.eventTitleRow}>
              <AppIcon name="calendar" color={theme.textSecondary} />
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>NEXT HIGH IMPACT EVENT</ThemedText>
            </View>
            <ImpactBadge impact="HIGH" tone="negative" />
          </View>
          <ThemedText style={styles.eventTitle}>US CPI Inflation</ThemedText>
          <ThemedText style={[styles.countdown, { color: theme.primary }]}>02h 37m</ThemedText>
          <View style={[styles.eventStats, { borderTopColor: theme.border }]}>
            <MiniStat label="Previous" value="2.7%" />
            <MiniStat label="Forecast" value="2.8%" />
            <Tap
              accessibilityRole="button"
              onPress={() => setReminded((current) => !current)}
              haptic="success"
              style={[styles.remindButton, { borderColor: reminded ? `${theme.positive}80` : `${theme.primary}90`, backgroundColor: reminded ? `${theme.positive}16` : 'transparent' }]}>
              <AppIcon name="bell" size={18} color={reminded ? theme.positive : theme.primary} />
              <ThemedText type="smallBold" style={{ color: reminded ? theme.positive : theme.primary }}>{reminded ? 'Reminder set' : 'Remind me'}</ThemedText>
            </Tap>
          </View>
        </View>

        <View style={[styles.group, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <SectionHeader title="Live news" action="See all" onAction={() => router.push('/news')} />
          {newsItems.slice(0, 3).map((item, index) => (
            <NewsCard
              key={item.id}
              item={item}
              variant="compact"
              isLast={index === 2}
              onPress={() => setSelectedNews(item)}
              onLongPress={() => setSelectedNews(item)}
            />
          ))}
        </View>

        <View style={[styles.aiCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.aiIcon}><AppIcon name="sparkles" color={theme.primary} /></View>
          <View style={styles.aiCopy}>
            <ThemedText style={styles.aiTitle}>AI readout</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">Markets are positioning for a hotter CPI print. Elevated BTC open interest suggests higher volatility into the release.</ThemedText>
          </View>
          <AppIcon name="chevron" color={theme.textMuted} />
        </View>

        <View style={styles.sectionGap}>
          <SectionHeader title="Derivatives snapshot" action="Details" onAction={() => router.push('/derivatives')} />
          <View style={[styles.metrics, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {derivativeMetrics.map((metric) => <MetricTile key={metric.label} label={metric.label} value={metric.value} note={metric.change} tone={metric.tone} />)}
          </View>
        </View>
      </ScrollView>

      <BottomSheet visible={quickSheet} title="Quick search" onClose={() => setQuickSheet(false)}>
        <View style={styles.sheetOptions}>
          {marketAssets.slice(0, 4).map((asset) => (
            <Tap key={asset.symbol} accessibilityRole="button" onPress={() => { setQuickSheet(false); openAsset(asset.symbol); }} style={[styles.sheetRow, { borderBottomColor: theme.border }]}>
              <ThemedText style={styles.sheetSymbol}>{asset.symbol}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{asset.name}</ThemedText>
              <AppIcon name="chevron" color={theme.textMuted} />
            </Tap>
          ))}
        </View>
      </BottomSheet>

      <BottomSheet visible={settingsOpen} title="Settings" onClose={() => setSettingsOpen(false)}>
        <View style={styles.settingGroup}>
          <ThemedText type="smallBold">Font size</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">Choose the reading size that feels best.</ThemedText>
          <View style={styles.fontOptions}>
            {([
              ['Compact', 0.9],
              ['Standard', 1],
              ['Large', 1.1],
            ] as const).map(([label, scale]) => {
              const selected = fontScale === scale;
              return (
                <Tap
                  key={label}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setFontScale(scale)}
                  style={[styles.fontOption, { borderColor: selected ? theme.primary : theme.border }]}>
                  <ThemedText type="smallBold" style={{ color: selected ? theme.primary : theme.textSecondary }}>{label}</ThemedText>
                </Tap>
              );
            })}
          </View>
        </View>
      </BottomSheet>
      <SessionVariantSheet
        visible={sessionSheetOpen}
        onClose={() => setSessionSheetOpen(false)}
      />
      <WorldClockSheet
        visible={clockSheetOpen}
        onClose={() => setClockSheetOpen(false)}
      />
      <NewsActionSheet story={selectedNews} onClose={() => setSelectedNews(null)} />
    </View>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return <View style={styles.miniStat}><ThemedText type="small" themeColor="textSecondary">{label}</ThemedText><ThemedText style={styles.miniValue}>{value}</ThemedText></View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: Spacing.four, paddingTop: Spacing.four, paddingBottom: Spacing.eight, gap: Spacing.four },
  heroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.one },
  title: { fontSize: 27, lineHeight: 32, fontWeight: '700', letterSpacing: -0.6 },
  live: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: Radius.full, paddingHorizontal: Spacing.two, paddingVertical: 4 },
  liveDot: { width: 6, height: 6, borderRadius: Radius.full },
  eventCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.lg, padding: Spacing.four, gap: Spacing.three },
  eventTopline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eventTitleRow: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  eventTitle: { fontSize: 20, lineHeight: 25, fontWeight: '700', letterSpacing: -0.4 },
  countdown: { fontSize: 38, lineHeight: 44, fontWeight: '700', letterSpacing: -1.2, fontVariant: ['tabular-nums'] },
  eventStats: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.three, flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.three },
  miniStat: { gap: 2, minWidth: 56 },
  miniValue: { fontSize: 18, lineHeight: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },
  remindButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two, minHeight: 38, borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.md },
  group: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.lg, paddingHorizontal: Spacing.four, paddingVertical: Spacing.three, gap: Spacing.two },
  newsRow: { flexDirection: 'row', gap: Spacing.three, paddingVertical: Spacing.three },
  newsTime: { width: 34, paddingTop: 2, fontVariant: ['tabular-nums'] },
  newsBody: { flex: 1, gap: 4 },
  newsMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  newsCategory: { fontSize: 10, lineHeight: 13, fontWeight: '800', letterSpacing: 0.8 },
  newsHeadline: { lineHeight: 19 },
  sectionGap: { gap: Spacing.three },
  aiCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.lg, padding: Spacing.four },
  aiIcon: { width: 32, height: 32, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  aiCopy: { flex: 1, gap: 3 },
  aiTitle: { fontSize: 15, lineHeight: 19, fontWeight: '700' },
  metrics: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.lg, padding: Spacing.four, flexDirection: 'row', flexWrap: 'wrap', rowGap: Spacing.five },
  sheetOptions: { gap: 0 },
  sheetRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderBottomWidth: StyleSheet.hairlineWidth },
  sheetSymbol: { width: 40, fontWeight: '700' },
  settingGroup: { gap: Spacing.two },
  fontOptions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  fontOption: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.md },
});
