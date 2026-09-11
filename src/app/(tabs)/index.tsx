import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { BottomSheet } from '@/components/bottom-sheet';
import { MarketSessionBanner, SessionVariantSheet, WorldClockSheet } from '@/components/market-session';
import { MetricTile, SectionHeader } from '@/components/market-ui';
import { Screen, ScreenHeader, useChromeInset } from '@/components/screen';
import { EventRow, ValueLegend } from '@/components/calendar/event-row';
import { NextReleaseCard } from '@/components/calendar/next-release-card';
import { Tap } from '@/components/tap';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { impactRank, type CalendarEvent } from '@/data/calendar';
import type { AssetSummary } from '@/data/derivatives';
import {
  changeTone,
  formatPercent,
  formatUsd,
  fundingTone,
  fundingVerdict,
  formatPrice,
  formatRate,
  ratioToLongPercent,
} from '@/data/derivatives';
import { useAgentPanel } from '@/agent';
import { useCalendar, useNow } from '@/hooks/use-calendar';
import { useDerivatives } from '@/hooks/use-derivatives';
import { useAppTheme, useTheme } from '@/hooks/use-theme';

/** The four numbers worth carrying on a screen that is mostly about the calendar. */
function derivativeTiles(summary: AssetSummary) {
  const longPercent = ratioToLongPercent(summary.longShortRatio.h24);
  return [
    {
      label: 'Open interest',
      value: formatUsd(summary.openInterestUsd),
      note: formatPercent(summary.openInterestChange.h24),
      tone: changeTone(summary.openInterestChange.h24),
    },
    {
      label: 'Funding',
      value: formatRate(summary.fundingRateByOpenInterest),
      note: fundingVerdict(summary.fundingRateByOpenInterest),
      tone: fundingTone(summary.fundingRateByOpenInterest),
    },
    {
      label: 'Long / short',
      value: longPercent === null ? '—' : `${Math.round(longPercent)}% / ${Math.round(100 - longPercent)}%`,
      note: longPercent === null ? '—' : longPercent >= 50 ? 'Longs ahead' : 'Shorts ahead',
      tone: 'neutral' as const,
    },
    {
      label: 'Liquidations',
      value: formatUsd(summary.liquidationUsd24h),
      note: '24H',
      tone: 'warning' as const,
    },
  ];
}

export default function PulseScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { fontScale, setFontScale } = useAppTheme();
  const bottomInset = useChromeInset();
  const [reminders, setReminders] = useState<string[]>([]);
  const [quickSheet, setQuickSheet] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sessionSheetOpen, setSessionSheetOpen] = useState(false);
  const [clockSheetOpen, setClockSheetOpen] = useState(false);

  const { openAgent } = useAgentPanel();
  const now = useNow();
  const { data, refreshing, refresh, live } = useCalendar();
  // No symbol: the service leads with whatever it tracks first, usually BTC.
  const { data: derivatives } = useDerivatives(null);

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
    <Screen>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomInset }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.primary} />}>
        <ScreenHeader
          title="MarketPulse"
          status={
            <View style={styles.statusLine}>
              <View style={[styles.liveDot, { backgroundColor: live ? theme.positive : theme.textMuted }]} />
              <ThemedText type="small" themeColor="textMuted" numberOfLines={1}>
                {new Date(now).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
                {data ? ` · ${upcoming.length} releases ahead` : ' · connecting'}
              </ThemedText>
            </View>
          }
          actions={[
            { icon: 'search', label: 'Quick search', onPress: () => setQuickSheet(true) },
            { icon: 'settings', label: 'Settings', onPress: () => setSettingsOpen(true) },
          ]}
        />

        <MarketSessionBanner
          onExploreVariants={() => setSessionSheetOpen(true)}
          onPressClock={() => setClockSheetOpen(true)}
        />

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
            <SectionHeader title="Upcoming releases" action="Calendar" onAction={openCalendar} />
            {/* The rows carry no labels of their own — the legend explains the
                value columns here exactly as the day header does in Calendar. */}
            <View style={styles.legendRow}>
              <ValueLegend />
            </View>
            {preview.map((event) => (
              <EventRow key={event.id} event={event} onSelect={openEvent} />
            ))}
          </View>
        ) : null}

        {/* An entry point, not a canned opinion. The readout that used to sit
            here was hardcoded prose that never changed with the market; the
            assistant behind this row reads the same data the screen does. */}
        <Tap
          accessibilityRole="button"
          accessibilityLabel="Ask the market assistant"
          onPress={() =>
            openAgent({
              prompt: nextHighImpact
                ? `What should I watch into ${nextHighImpact.currency} ${nextHighImpact.title}?`
                : 'What is driving the market right now?',
            })
          }
          style={[styles.aiCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.aiIcon}><AppIcon name="sparkles" color={theme.primary} /></View>
          <View style={styles.aiCopy}>
            <ThemedText style={styles.aiTitle}>Ask the assistant</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {nextHighImpact
                ? `What to watch into ${nextHighImpact.currency} ${nextHighImpact.title}`
                : 'What is driving the market right now'}
            </ThemedText>
          </View>
          <AppIcon name="chevron" color={theme.textMuted} />
        </Tap>

        {derivatives?.asset ? (
          <View style={styles.sectionGap}>
            <SectionHeader
              title={`${derivatives.asset.summary.symbol} derivatives`}
              action="Details"
              onAction={() => router.push('/derivatives')}
            />
            <View style={[styles.metrics, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              {derivativeTiles(derivatives.asset.summary).map((tile) => (
                <MetricTile key={tile.label} label={tile.label} value={tile.value} note={tile.note} tone={tile.tone} />
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>

      <BottomSheet visible={quickSheet} title="Quick search" onClose={() => setQuickSheet(false)}>
        <View style={styles.sheetOptions}>
          {(derivatives?.market?.screener ?? []).slice(0, 6).map((row) => (
            <Tap
              key={row.symbol}
              accessibilityRole="button"
              accessibilityLabel={`Open ${row.name ?? row.symbol}`}
              onPress={() => {
                setQuickSheet(false);
                openAsset(row.symbol);
              }}
              style={[styles.sheetRow, { borderBottomColor: theme.border }]}>
              <ThemedText style={styles.sheetSymbol}>{row.symbol}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.sheetName}>
                {row.name ?? '—'}
              </ThemedText>
              <ThemedText type="small" themeColor="textMuted">{formatPrice(row.price)}</ThemedText>
              <AppIcon name="chevron" color={theme.textMuted} />
            </Tap>
          ))}
          {derivatives?.market?.screener.length ? null : (
            <ThemedText type="small" themeColor="textSecondary">
              Markets load once the service has scraped.
            </ThemedText>
          )}
        </View>
      </BottomSheet>

      <BottomSheet visible={settingsOpen} title="Settings" onClose={() => setSettingsOpen(false)}>
        <Tap
          accessibilityRole="button"
          accessibilityLabel="AI and Agents settings"
          onPress={() => {
            setSettingsOpen(false);
            router.push('/settings/ai');
          }}
          style={[styles.settingLink, { borderColor: theme.border }]}>
          <AppIcon name="sparkles" size={17} color={theme.primary} />
          <View style={styles.settingLinkCopy}>
            <ThemedText type="smallBold">AI &amp; Agents</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Providers, models, agents, search and permissions
            </ThemedText>
          </View>
          <AppIcon name="chevron" size={14} color={theme.textMuted} />
        </Tap>
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: Spacing.four, paddingTop: Spacing.four, paddingBottom: Spacing.eight, gap: Spacing.four },
  legendRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingBottom: Spacing.one },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
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
  sheetName: { flex: 1 },
  sheetSymbol: { width: 40, fontWeight: '700' },
  settingLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 52,
    paddingHorizontal: Spacing.four,
    marginBottom: Spacing.four,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
  },
  settingLinkCopy: { flex: 1, gap: 1 },
  settingGroup: { gap: Spacing.two },
  fontOptions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  fontOption: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.md },
});
