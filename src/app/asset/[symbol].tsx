import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useReportContext } from '@/agent/state/use-report-context';

import { AppIcon } from '@/components/app-icon';
import { AssetIcon } from '@/components/asset-icon';
import { Card, DataRow, Note, StatGrid } from '@/components/derivatives/primitives';
import { VenueList } from '@/components/derivatives/venue-list';
import { EmptyState, FilterChips, LineChart, toneColor } from '@/components/market-ui';
import { Screen } from '@/components/screen';
import { Skeleton } from '@/components/skeleton';
import { TabSwipe } from '@/components/tab-swipe';
import { Tap } from '@/components/tap';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import {
  changeTone,
  formatAgo,
  formatCount,
  formatPercent,
  formatPrice,
  formatRate,
  formatUsd,
  fundingTone,
  fundingVerdict,
  positioningNote,
  ratioToLongPercent,
  type AssetDerivatives,
  type ScreenerRow,
} from '@/data/derivatives';
import { useNow } from '@/hooks/use-calendar';
import { useDerivatives } from '@/hooks/use-derivatives';
import { useTheme } from '@/hooks/use-theme';

/** Windows over the five-minute price series the service keeps. */
const RANGES = { '1H': 12, '4H': 48, '12H': 144, '1D': 288 } as const;
type Range = keyof typeof RANGES;

/**
 * One coin, in full.
 *
 * Everything here is the same scrape the Derivatives tab reads, so a price on
 * this screen can never disagree with a price one tab over — which it used to,
 * by twenty thousand dollars, because this screen was mock data.
 */
export default function AssetDetailScreen() {
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const router = useRouter();
  const theme = useTheme();
  const now = useNow(5_000);
  const wanted = String(symbol ?? '').toUpperCase();

  const [range, setRange] = useState<Range>('1D');
  const [watching, setWatching] = useState(false);
  const { data, error, loading, refreshing, refresh } = useDerivatives(wanted || null);

  const asset = data?.asset?.summary.symbol === wanted ? data.asset : null;

  // The detail screen is the most specific thing the user can be looking at,
  // so it is the one the assistant should follow.
  useReportContext({
    symbol: wanted || null,
    chartId: wanted ? `asset:${wanted}` : null,
    workspace: 'Asset detail',
  });
  const screenerRow = useMemo(
    () => data?.market?.screener.find((row) => row.symbol === wanted) ?? null,
    [data, wanted],
  );

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/markets');
  };

  const name = asset?.summary.name ?? screenerRow?.name ?? wanted;
  const price = asset?.summary.price ?? screenerRow?.price ?? null;
  const change = asset?.summary.priceChangePercent24h ?? screenerRow?.priceChangePercent24h ?? null;
  const tone = changeTone(change);

  return (
    <Screen>
      <TabSwipe>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.primary} />
          }>
          <View style={styles.nav}>
            <Tap accessibilityRole="button" accessibilityLabel="Back" onPress={goBack} style={styles.navButton}>
              <AppIcon name="back" color={theme.textSecondary} />
            </Tap>
            <ThemedText style={styles.navTitle} numberOfLines={1}>
              {wanted}
            </ThemedText>
            <Tap
              accessibilityRole="button"
              accessibilityLabel={watching ? 'Stop watching' : 'Watch asset'}
              accessibilityState={{ selected: watching }}
              onPress={() => setWatching((value) => !value)}
              style={styles.navButton}>
              <AppIcon name="watch" color={watching ? theme.warning : theme.textSecondary} />
            </Tap>
          </View>

          <View style={styles.hero}>
            <AssetIcon symbol={wanted} size={38} />
            <View style={styles.heroName}>
              <ThemedText style={styles.symbol} numberOfLines={1}>
                {wanted}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {name}
              </ThemedText>
            </View>
            <View style={styles.heroPrice}>
              <ThemedText style={styles.price}>{formatPrice(price)}</ThemedText>
              <ThemedText type="smallBold" style={{ color: toneColor(theme, tone) }}>
                {formatPercent(change)}
              </ThemedText>
            </View>
          </View>

          {error ? (
            <View style={styles.empty}>
              <EmptyState
                icon="chart"
                title="Cannot load this market"
                body={error}
                action="Retry"
                onAction={refresh}
              />
            </View>
          ) : null}

          {loading && !data ? <DetailSkeleton /> : null}

          {asset ? (
            <TrackedAsset asset={asset} range={range} onRange={setRange} now={now} />
          ) : screenerRow ? (
            <ScreenerOnly row={screenerRow} />
          ) : null}
        </ScrollView>
      </TabSwipe>
    </Screen>
  );
}

/** The full picture: the service keeps a venue-level breakdown for this coin. */
function TrackedAsset({
  asset,
  range,
  onRange,
  now,
}: {
  asset: AssetDerivatives;
  range: Range;
  onRange: (range: Range) => void;
  now: number;
}) {
  const { summary } = asset;
  // The series is five-minute points, so a window is just its tail.
  const points = asset.priceHistory.slice(-RANGES[range]).map((point) => point.price);
  const longPercent = ratioToLongPercent(summary.longShortRatio.h24);

  return (
    <>
      <FilterChips
        items={Object.keys(RANGES)}
        value={range}
        onChange={(next) => onRange(next as Range)}
        accessibilityLabel="Chart range"
      />

      {points.length > 3 ? (
        <Card
          title={`${range} price`}
          action={
            <ThemedText type="small" themeColor="textSecondary">
              {formatAgo(asset.priceHistory.at(-1)?.at ?? null, now)}
            </ThemedText>
          }>
          <LineChart points={points} tone={changeTone(summary.priceChangePercent24h)} />
          <Note>{points.length} five-minute points from CoinGlass.</Note>
        </Card>
      ) : null}

      <Card title="Derivatives">
        <StatGrid
          stats={[
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
              label: '24H volume',
              value: formatUsd(summary.volumeUsd24h),
              note: formatPercent(summary.volumeChange.h24),
              tone: changeTone(summary.volumeChange.h24),
            },
            {
              label: 'Long / short',
              value:
                longPercent === null
                  ? '—'
                  : `${Math.round(longPercent)}% / ${Math.round(100 - longPercent)}%`,
              note: longPercent === null ? undefined : longPercent >= 50 ? 'Longs ahead' : 'Shorts ahead',
            },
            {
              label: '24H liquidations',
              value: formatUsd(summary.liquidationUsd24h),
              note: `${formatCount(summary.liquidationCount24h)} positions`,
              tone: 'warning',
            },
            {
              label: 'Market cap',
              value: formatUsd(summary.marketCap, 1),
              note: summary.oiMarketCapRatio === null ? undefined : `OI is ${(summary.oiMarketCapRatio * 100).toFixed(1)}%`,
            },
          ]}
        />
      </Card>

      <Card title="Top venues">
        <VenueList venues={asset.venues} mode="openInterest" limit={5} />
      </Card>

      <Card title="What the positioning says">
        <Note>
          {positioningNote(
            summary.priceChangePercent24h,
            summary.openInterestChange.h24 ?? null,
            summary.fundingRateByOpenInterest,
          )}
        </Note>
      </Card>
    </>
  );
}

/** A coin the scraper does not keep a breakdown for — say so, show what we have. */
function ScreenerOnly({ row }: { row: ScreenerRow }) {
  return (
    <>
      <Card title="Derivatives">
        <StatGrid
          stats={[
            {
              label: 'Open interest',
              value: formatUsd(row.openInterestUsd),
              note: formatPercent(row.openInterestChange.h24),
              tone: changeTone(row.openInterestChange.h24),
            },
            {
              label: 'Funding',
              value: formatRate(row.fundingRateByOpenInterest),
              note: fundingVerdict(row.fundingRateByOpenInterest),
              tone: fundingTone(row.fundingRateByOpenInterest),
            },
            { label: '24H volume', value: formatUsd(row.volumeUsd24h), note: formatPercent(row.volumeChangePercent24h), tone: changeTone(row.volumeChangePercent24h) },
            { label: '24H liquidations', value: formatUsd(row.liquidationUsd24h), tone: 'warning' },
          ]}
        />
      </Card>

      <Card title="Liquidations (24H)">
        <DataRow label="Longs" value={formatUsd(row.longLiquidationUsd24h)} tone="positive" />
        <DataRow label="Shorts" value={formatUsd(row.shortLiquidationUsd24h)} tone="negative" />
      </Card>

      <Card>
        <Note>
          The service keeps a venue-by-venue breakdown for its tracked coins only. These are the
          whole-market figures CoinGlass publishes for {row.symbol}.
        </Note>
      </Card>
    </>
  );
}

function DetailSkeleton() {
  return (
    <View style={styles.skeleton}>
      <Skeleton style={{ height: 34, borderRadius: Radius.md }} />
      <Skeleton style={{ height: 190, borderRadius: Radius.lg }} />
      <Skeleton style={{ height: 150, borderRadius: Radius.lg }} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.eight,
    gap: Spacing.four,
  },
  nav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  navButton: { width: 34, height: 34, justifyContent: 'center', alignItems: 'center', borderRadius: Radius.md },
  navTitle: { fontSize: 16, fontWeight: '700' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  heroName: { flex: 1, gap: 1 },
  heroPrice: { alignItems: 'flex-end', gap: 1 },
  symbol: { fontSize: 18, lineHeight: 22, fontWeight: '700' },
  price: { fontSize: 19, lineHeight: 24, fontWeight: '700', fontVariant: ['tabular-nums'] },
  empty: { paddingTop: Spacing.two },
  skeleton: { gap: Spacing.four },
});
