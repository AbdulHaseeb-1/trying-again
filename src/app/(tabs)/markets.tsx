import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

import { AppIcon } from '@/components/app-icon';
import { AssetIcon } from '@/components/asset-icon';
import { BottomSheet } from '@/components/bottom-sheet';
import { ShareBar } from '@/components/derivatives/primitives';
import { EmptyState, FilterChips, toneColor } from '@/components/market-ui';
import { Screen, ScreenHeader, useChromeInset } from '@/components/screen';
import { Skeleton } from '@/components/skeleton';
import { Tap } from '@/components/tap';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import {
  changeTone,
  formatPercent,
  formatPrice,
  formatRate,
  formatUsd,
  fundingTone,
  type ScreenerRow,
} from '@/data/derivatives';
import { useDerivatives } from '@/hooks/use-derivatives';
import { useTheme } from '@/hooks/use-theme';

/**
 * Sorts, not categories.
 *
 * The old category filter (Crypto / Indices / Commodities / FX) described a
 * mock list of seven instruments. What the service actually returns is every
 * coin with a futures market, so the useful question is not "which asset
 * class" but "which end of the market" — and each sort answers one.
 */
const SORTS = ['Open interest', 'Volume', 'Gainers', 'Losers', 'Funding', 'Liquidations'] as const;
type Sort = (typeof SORTS)[number];

const compare: Record<Sort, (a: ScreenerRow, b: ScreenerRow) => number> = {
  'Open interest': (a, b) => (b.openInterestUsd ?? 0) - (a.openInterestUsd ?? 0),
  Volume: (a, b) => (b.volumeUsd24h ?? 0) - (a.volumeUsd24h ?? 0),
  Gainers: (a, b) => (b.priceChangePercent24h ?? 0) - (a.priceChangePercent24h ?? 0),
  Losers: (a, b) => (a.priceChangePercent24h ?? 0) - (b.priceChangePercent24h ?? 0),
  // Funding is a two-tailed measure: the extremes are the story, either way.
  Funding: (a, b) =>
    Math.abs(b.fundingRateByOpenInterest ?? 0) - Math.abs(a.fundingRateByOpenInterest ?? 0),
  Liquidations: (a, b) => (b.liquidationUsd24h ?? 0) - (a.liquidationUsd24h ?? 0),
};

export default function MarketsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const bottomInset = useChromeInset();
  const { data, error, loading, refreshing, refresh } = useDerivatives(null);

  const [sort, setSort] = useState<Sort>('Open interest');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const screener = data?.market?.screener ?? [];
    const needle = query.trim().toLowerCase();
    return screener
      .filter((row) => !needle || `${row.symbol} ${row.name ?? ''}`.toLowerCase().includes(needle))
      .slice()
      .sort(compare[sort]);
  }, [data, query, sort]);

  // Bars are relative to the biggest row on screen, so the list re-scales as
  // the sort changes instead of everything hugging zero.
  const peak = useMemo(
    () => rows.reduce((most, row) => Math.max(most, metricValue(row, sort)), 0),
    [rows, sort],
  );

  const openAsset = (symbol: string) =>
    router.push({ pathname: '/asset/[symbol]', params: { symbol } });

  return (
    <Screen>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.symbol}
        contentContainerStyle={[styles.content, { paddingBottom: bottomInset }]}
        showsVerticalScrollIndicator={false}
        initialNumToRender={14}
        windowSize={9}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.primary} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <ScreenHeader
              title="Markets"
              status={
                data ? (
                  <ThemedText type="small" themeColor="textMuted" numberOfLines={1}>
                    {rows.length} of {data.market?.screener.length ?? 0} coins · CoinGlass
                  </ThemedText>
                ) : null
              }
              actions={[{ icon: 'search', label: 'Search markets', onPress: () => setSearchOpen(true) }]}
            />
            {error ? (
              <ThemedText type="small" style={{ color: theme.warning }}>
                {error}
              </ThemedText>
            ) : null}
            <FilterChips
              items={[...SORTS]}
              value={sort}
              onChange={(next) => setSort(next as Sort)}
              accessibilityLabel="Sort markets"
            />
            <View style={styles.legend}>
              <ThemedText type="small" themeColor="textMuted">
                {sort}
              </ThemedText>
              <ThemedText type="small" themeColor="textMuted">
                Price · 24H
              </ThemedText>
            </View>
            {loading && !data ? <MarketsSkeleton /> : null}
          </View>
        }
        renderItem={({ item }) => (
          <MarketRow row={item} sort={sort} peak={peak} onPress={() => openAsset(item.symbol)} />
        )}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <EmptyState
                icon="markets"
                title={query ? 'Nothing matches' : 'No markets loaded'}
                body={
                  query
                    ? `No coin matches “${query.trim()}”.`
                    : 'The market-data service has not returned a screener yet.'
                }
                action={query ? 'Clear search' : 'Retry'}
                onAction={query ? () => setQuery('') : refresh}
              />
            </View>
          )
        }
      />

      <BottomSheet visible={searchOpen} title="Search markets" onClose={() => setSearchOpen(false)}>
        <View style={styles.sheetContent}>
          <View style={[styles.inputWrap, { backgroundColor: theme.surfaceVariant, borderColor: theme.border }]}>
            <AppIcon name="search" size={18} color={theme.textMuted} />
            <TextInput
              autoFocus
              value={query}
              onChangeText={setQuery}
              placeholder="BTC, Solana, HYPE…"
              placeholderTextColor={theme.textMuted}
              accessibilityLabel="Search markets"
              returnKeyType="search"
              onSubmitEditing={() => setSearchOpen(false)}
              style={[styles.input, { color: theme.text }]}
            />
            {query ? (
              <Tap accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQuery('')}>
                <AppIcon name="close" size={16} color={theme.textMuted} />
              </Tap>
            ) : null}
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {rows.length} {rows.length === 1 ? 'match' : 'matches'}
          </ThemedText>
          <Tap
            accessibilityRole="button"
            onPress={() => setSearchOpen(false)}
            style={[styles.doneButton, { backgroundColor: theme.primary }]}>
            <ThemedText type="smallBold" style={{ color: theme.background }}>
              Done
            </ThemedText>
          </Tap>
        </View>
      </BottomSheet>
    </Screen>
  );
}

/** The number the current sort ranks by, used for the row's bar. */
function metricValue(row: ScreenerRow, sort: Sort): number {
  if (sort === 'Volume') return row.volumeUsd24h ?? 0;
  if (sort === 'Gainers' || sort === 'Losers') return Math.abs(row.priceChangePercent24h ?? 0);
  if (sort === 'Funding') return Math.abs(row.fundingRateByOpenInterest ?? 0);
  if (sort === 'Liquidations') return row.liquidationUsd24h ?? 0;
  return row.openInterestUsd ?? 0;
}

/** What the sorted-by column reads as, so the ranking is never unexplained. */
function metricLabel(row: ScreenerRow, sort: Sort): string {
  if (sort === 'Volume') return `${formatUsd(row.volumeUsd24h)} vol`;
  if (sort === 'Gainers' || sort === 'Losers') return `${formatUsd(row.openInterestUsd)} OI`;
  if (sort === 'Funding') return `${formatRate(row.fundingRateByOpenInterest)} funding`;
  if (sort === 'Liquidations') return `${formatUsd(row.liquidationUsd24h)} liquidated`;
  return `${formatUsd(row.openInterestUsd)} OI`;
}

function MarketRow({
  row,
  sort,
  peak,
  onPress,
}: {
  row: ScreenerRow;
  sort: Sort;
  peak: number;
  onPress: () => void;
}) {
  const theme = useTheme();
  const tone = changeTone(row.priceChangePercent24h);
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={`${row.name ?? row.symbol}, ${formatPrice(row.price)}, ${formatPercent(row.priceChangePercent24h)}`}
      onPress={onPress}
      style={[styles.row, { borderBottomColor: theme.border }]}>
      <View style={styles.rowTop}>
        <View style={styles.mark}>
          <AssetIcon symbol={row.symbol} size={28} />
        </View>
        <View style={styles.name}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {row.symbol}
          </ThemedText>
          <ThemedText type="small" themeColor="textMuted" numberOfLines={1}>
            {/* Not every coin comes with a name; showing the ranking metric
                here instead would just repeat the value beside the bar. */}
            {row.name ?? (row.volumeUsd24h ? `${formatUsd(row.volumeUsd24h)} 24H volume` : 'Perpetual market')}
          </ThemedText>
        </View>
        <View style={styles.values}>
          <ThemedText type="smallBold" style={styles.tabular}>
            {formatPrice(row.price)}
          </ThemedText>
          <ThemedText type="small" style={[styles.tabular, { color: toneColor(theme, tone) }]}>
            {formatPercent(row.priceChangePercent24h)}
          </ThemedText>
        </View>
      </View>
      <View style={styles.rowBottom}>
        <View style={styles.bar}>
          <ShareBar
            percent={peak > 0 ? (metricValue(row, sort) / peak) * 100 : 0}
            tone={
              sort === 'Liquidations'
                ? 'negative'
                : sort === 'Funding'
                  ? fundingTone(row.fundingRateByOpenInterest)
                  : 'positive'
            }
          />
        </View>
        <ThemedText type="small" themeColor="textMuted" numberOfLines={1} style={styles.metric}>
          {metricLabel(row, sort)}
        </ThemedText>
      </View>
    </Tap>
  );
}

function MarketsSkeleton() {
  return (
    <View style={styles.skeleton}>
      {[0, 1, 2, 3, 4, 5].map((row) => (
        <Skeleton key={row} style={{ height: 52, borderRadius: Radius.md }} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: Spacing.four, paddingTop: Spacing.four },
  header: { gap: Spacing.three, paddingBottom: Spacing.two },
  legend: { flexDirection: 'row', justifyContent: 'space-between' },
  row: { paddingVertical: Spacing.three, gap: Spacing.two, borderBottomWidth: StyleSheet.hairlineWidth },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  mark: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  name: { flex: 1, gap: 1 },
  values: { alignItems: 'flex-end', gap: 1 },
  tabular: { fontVariant: ['tabular-nums'] },
  rowBottom: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  bar: { flex: 1 },
  metric: { minWidth: 128, textAlign: 'right', fontSize: 11 },
  empty: { paddingVertical: Spacing.seven },
  skeleton: { gap: Spacing.three, paddingTop: Spacing.two },
  sheetContent: { gap: Spacing.four },
  inputWrap: {
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  input: { flex: 1, fontSize: 16, minHeight: 42 },
  doneButton: { minHeight: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
});
