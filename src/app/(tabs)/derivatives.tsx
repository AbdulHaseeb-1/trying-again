import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { BottomSheet } from '@/components/bottom-sheet';
import { Card, Note } from '@/components/derivatives/primitives';
import { SyncStatus } from '@/components/derivatives/sync-status';
import {
  FundingView,
  LiquidationsView,
  LiquidityView,
  MarketView,
  OpenInterestView,
  OverviewView,
  PositioningView,
} from '@/components/derivatives/views';
import { EmptyState, FilterChips } from '@/components/market-ui';
import { Skeleton } from '@/components/skeleton';
import { Tap } from '@/components/tap';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { formatPercent, formatPrice, formatUsd } from '@/data/derivatives';
import { useNow } from '@/hooks/use-calendar';
import { useDerivatives } from '@/hooks/use-derivatives';
import { useLiquidityMap } from '@/hooks/use-liquidity-map';
import { useTheme } from '@/hooks/use-theme';

const VIEWS = [
  'Overview',
  'Open Interest',
  'Funding',
  'Liquidations',
  'Liquidity Map',
  'Positioning',
  'Market',
] as const;
type ViewName = (typeof VIEWS)[number];

/**
 * The derivatives screen, backed by the CoinGlass scraper in `server/`.
 *
 * One asset at a time, seen six ways. The chips are views of the same scrape
 * rather than separate fetches, so switching between them is instant and the
 * numbers can never disagree with each other.
 */
export default function DerivativesScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const now = useNow(5_000);

  const [symbol, setSymbol] = useState<string | null>(null);
  const [view, setView] = useState<ViewName>('Overview');
  const [selectorOpen, setSelectorOpen] = useState(false);

  // Until the user picks, `symbol` stays null and the service leads with its
  // first tracked asset — no effect syncing one to the other.
  const { data, error, loading, refreshing, live, refresh } = useDerivatives(symbol);

  const available = useMemo(() => data?.available ?? [], [data?.available]);
  const asset = data?.asset ?? null;
  const market = data?.market ?? null;
  const activeSymbol = asset?.summary.symbol ?? symbol ?? data?.symbol ?? null;

  // The heatmap is fetched only while its view is open: it is far bigger than
  // the rest of the payload and nothing else draws it.
  const liquidity = useLiquidityMap(
    activeSymbol,
    view === 'Liquidity Map',
    data?.refreshIntervalMs ?? 60_000,
  );

  const select = useCallback((next: string) => {
    setSymbol(next);
    setSelectorOpen(false);
  }, []);

  const body = useMemo(() => {
    if (view === 'Market') {
      return <MarketView market={market} available={available} onSelect={select} />;
    }
    if (view === 'Liquidity Map') {
      return (
        <LiquidityView
          map={liquidity.map}
          loading={liquidity.loading}
          error={liquidity.error}
          unavailable={liquidity.unavailable}
          symbol={activeSymbol ?? '—'}
          now={now}
        />
      );
    }
    if (!asset) return null;
    const props = { asset, market, now };
    if (view === 'Open Interest') return <OpenInterestView {...props} />;
    if (view === 'Funding') return <FundingView {...props} />;
    if (view === 'Liquidations') return <LiquidationsView {...props} />;
    if (view === 'Positioning') return <PositioningView {...props} />;
    return <OverviewView {...props} />;
  }, [activeSymbol, asset, available, liquidity, market, now, select, view]);

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <View style={styles.column}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: 128 + insets.bottom }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.primary} />
          }>
          <View style={styles.header}>
            <View style={styles.titleBlock}>
              <ThemedText style={styles.title}>Derivatives</ThemedText>
              {data ? <SyncStatus data={data} live={live} now={now} /> : null}
            </View>
            <View style={styles.headerActions}>
              <Tap
                accessibilityRole="button"
                accessibilityLabel="Refresh derivatives"
                onPress={refresh}
                haptic="none"
                style={[styles.iconButton, { borderColor: theme.border }]}>
                <AppIcon name="trend" size={16} color={theme.textSecondary} />
              </Tap>
              <Tap
                accessibilityRole="button"
                accessibilityLabel="Select asset"
                onPress={() => setSelectorOpen(true)}
                style={[styles.assetSelect, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                <ThemedText type="smallBold">{activeSymbol ?? '—'}</ThemedText>
                <AppIcon name="chevron" size={16} color={theme.textMuted} />
              </Tap>
            </View>
          </View>

          {error ? <ErrorNotice message={error} onRetry={refresh} /> : null}

          <FilterChips items={[...VIEWS]} value={view} onChange={(next) => setView(next as ViewName)} />

          {loading && !data ? <DerivativesSkeleton /> : null}

          {!loading && !asset && view !== 'Market' && view !== 'Liquidity Map' ? (
            <EmptyState
              icon="chart"
              title="No derivatives data yet"
              body={
                available.length
                  ? 'The service has not captured this asset yet. Pull to refresh or pick another.'
                  : 'Start the market-data service and it will scrape CoinGlass within a minute.'
              }
              action="Refresh"
              onAction={refresh}
            />
          ) : null}

          {body}
        </ScrollView>
      </View>

      <BottomSheet visible={selectorOpen} title="Select asset" onClose={() => setSelectorOpen(false)}>
        <View>
          {available.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary">
              No assets available yet.
            </ThemedText>
          ) : null}
          {available.map((option) => {
            const row = market?.screener.find((entry) => entry.symbol === option) ?? null;
            const selected = option === activeSymbol;
            return (
              <Tap
                key={option}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => select(option)}
                style={[styles.sheetOption, { borderBottomColor: theme.border }]}>
                <View>
                  <ThemedText type="smallBold" style={{ color: selected ? theme.primary : theme.text }}>
                    {option}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textMuted">
                    {row ? `${formatPrice(row.price)} · OI ${formatUsd(row.openInterestUsd)}` : 'Tracked'}
                  </ThemedText>
                </View>
                <View style={styles.sheetRight}>
                  {row ? (
                    <ThemedText type="small" themeColor="textSecondary">
                      {formatPercent(row.priceChangePercent24h)}
                    </ThemedText>
                  ) : null}
                  {selected ? <AppIcon name="eye" color={theme.primary} /> : null}
                </View>
              </Tap>
            );
          })}
        </View>
      </BottomSheet>
    </View>
  );
}

function ErrorNotice({ message, onRetry }: { message: string; onRetry: () => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.error, { borderColor: `${theme.warning}55`, backgroundColor: `${theme.warning}14` }]}>
      <ThemedText type="smallBold" style={{ color: theme.warning }}>
        Derivatives service unreachable
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{message}</ThemedText>
      <Tap accessibilityRole="button" onPress={onRetry} style={styles.retry}>
        <ThemedText type="smallBold" style={{ color: theme.primary }}>Try again</ThemedText>
      </Tap>
    </View>
  );
}

function DerivativesSkeleton() {
  return (
    <View style={styles.skeleton}>
      <Skeleton style={{ height: 64, borderRadius: Radius.md }} />
      <Skeleton style={{ height: 180, borderRadius: Radius.lg }} />
      <Skeleton style={{ height: 140, borderRadius: Radius.lg }} />
      <Card>
        <Note>Waiting for the first CoinGlass scrape…</Note>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  column: { flex: 1, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  content: { paddingHorizontal: Spacing.four, paddingTop: Spacing.four, gap: Spacing.four },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three },
  titleBlock: { flex: 1, gap: 2 },
  title: { fontSize: 24, lineHeight: 29, fontWeight: '700', letterSpacing: -0.6 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  iconButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  assetSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.two,
    minHeight: 32,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  error: { gap: Spacing.one, borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.md, padding: Spacing.four },
  retry: { alignSelf: 'flex-start', paddingTop: Spacing.two },
  skeleton: { gap: Spacing.four },
  sheetOption: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
