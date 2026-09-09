import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { BottomSheet } from '@/components/bottom-sheet';
import { MarketSessionBanner, SessionVariantSheet, WorldClockSheet } from '@/components/market-session';
import { AppHeader, MetricTile, SectionHeader } from '@/components/market-ui';
import { EventRow } from '@/components/calendar/event-row';
import { NextReleaseCard } from '@/components/calendar/next-release-card';
import { Tap } from '@/components/tap';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { impactRank, type CalendarEvent } from '@/data/calendar';
import { derivativeMetrics, marketAssets } from '@/data/market';
import { useCalendar, useNow } from '@/hooks/use-calendar';
import { useAppTheme, useTheme } from '@/hooks/use-theme';

export default function PulseScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { fontScale, setFontScale } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [reminders, setReminders] = useState<string[]>([]);
  const [quickSheet, setQuickSheet] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sessionSheetOpen, setSessionSheetOpen] = useState(false);
  const [clockSheetOpen, setClockSheetOpen] = useState(false);

  const now = useNow();
  const { data, refreshing, refresh } = useCalendar();

  // The Pulse tab cares about what can actually move a market, so it leads on
  // the next high-impact print and previews the rest.
  const upcoming = (data?.events ?? []).filter(
    (event) => !event.released && new Date(event.scheduledAt).getTime() >= now,
  );
  const nextHighImpact =
    upcoming.find((event) => impactRank(event.impact) >= impactRank('high')) ?? upcoming[0] ?? null;
  const preview: CalendarEvent[] = upcoming
    .filter((event) => impactRank(event.impact) >= impactRank('medium'))
    .slice(0, 4);

  const toggleReminder = (id: string) =>
    setReminders((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );

  const openCalendar = useCallback(() => router.push('/calendar'), [router]);
  const openEvent = useCallback(
    (event: CalendarEvent) => router.push(`/event/${event.id}`),
    [router],
  );

  const openAsset = (symbol: string) => router.push({ pathname: '/asset/[symbol]', params: { symbol } });

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
            <ThemedText type="small" themeColor="textSecondary">
              {new Date(now).toLocaleDateString(undefined, {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </ThemedText>
          </View>
          <View style={[styles.live, { backgroundColor: `${theme.positive}16` }]}>
            <View style={[styles.liveDot, { backgroundColor: theme.positive }]} />
            <ThemedText type="smallBold" style={{ color: theme.positive }}>Live</ThemedText>
          </View>
        </View>

        {nextHighImpact ? (
          <NextReleaseCard
            event={nextHighImpact}
            now={now}
            reminded={reminders.includes(nextHighImpact.id)}
            onToggleReminder={() => toggleReminder(nextHighImpact.id)}
          />
        ) : null}

        {preview.length ? (
          <View style={[styles.group, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <SectionHeader
              title="Upcoming releases"
              action="Calendar"
              onAction={openCalendar}
            />
            {preview.map((event) => (
              <EventRow key={event.id} event={event} onSelect={openEvent} />
            ))}
          </View>
        ) : null}

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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: Spacing.four, paddingTop: Spacing.four, paddingBottom: Spacing.eight, gap: Spacing.four },
  heroRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.one },
  title: { fontSize: 27, lineHeight: 32, fontWeight: '700', letterSpacing: -0.6 },
  live: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: Radius.full, paddingHorizontal: Spacing.two, paddingVertical: 4 },
  liveDot: { width: 6, height: 6, borderRadius: Radius.full },
  group: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.lg, paddingHorizontal: Spacing.two, paddingVertical: Spacing.three, gap: Spacing.one },
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
