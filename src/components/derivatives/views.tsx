import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import {
  Card,
  DataRow,
  Divider,
  KeyMetric,
  Note,
  ShareBar,
  SplitBar,
  StatGrid,
  WindowStrip,
} from '@/components/derivatives/primitives';
import { HeatLegend, LiquidityHeatmap } from '@/components/derivatives/liquidity-heatmap';
import { VenueList } from '@/components/derivatives/venue-list';
import { FilterChips, LineChart, toneColor } from '@/components/market-ui';
import { Tap } from '@/components/tap';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import {
  LIQUIDATION_WINDOWS,
  OI_WINDOWS,
  WINDOW_LABELS,
  changeTone,
  formatAgo,
  formatAmount,
  formatCardChange,
  formatCount,
  formatPercent,
  formatPrice,
  formatRate,
  formatUsd,
  fundingTone,
  fundingVerdict,
  longShare,
  nearestClusters,
  positioningNote,
  ratioToLongPercent,
  type AssetDerivatives,
  type LiquidationWindow,
  type LiquidityMap,
  type MarketOverview,
} from '@/data/derivatives';
import { useTheme } from '@/hooks/use-theme';

type ViewProps = { asset: AssetDerivatives; market: MarketOverview | null; now: number };

/** How long one funding interval is, read off the series' own timestamps. */
function fundingIntervalHours(asset: AssetDerivatives): number {
  const [first, second] = asset.fundingHistory;
  if (first && second) {
    const hours = Math.round((Date.parse(second.at) - Date.parse(first.at)) / 3_600_000);
    if (hours > 0) return hours;
  }
  return asset.venues.find((venue) => venue.fundingIntervalHours)?.fundingIntervalHours ?? 8;
}

// ------------------------------------------------------------------ overview

export function OverviewView({ asset, market, now }: ViewProps) {
  const theme = useTheme();
  const { summary } = asset;
  const prices = asset.priceHistory.map((point) => point.price);
  const takerLong = summary.longShortRatio.h24 ?? null;
  const longPercent = ratioToLongPercent(takerLong) ?? 50;

  return (
    <>
      <KeyMetric
        label="Open interest"
        value={formatUsd(summary.openInterestUsd)}
        change={formatPercent(summary.openInterestChange.h24)}
        tone={changeTone(summary.openInterestChange.h24)}
        note={`${formatAmount(summary.openInterestAmount, summary.symbol)} across ${asset.venues.length} venues`}
      />

      {prices.length > 3 ? (
        <Card
          title={`${summary.symbol} price`}
          action={
            <ThemedText type="small" themeColor="textSecondary">
              {formatPrice(summary.price)} · {formatPercent(summary.priceChangePercent24h)}
            </ThemedText>
          }>
          <LineChart points={prices} tone={changeTone(summary.priceChangePercent24h)} />
          <Note>
            {asset.priceHistory.length} five-minute points, ending {formatAgo(asset.priceHistory.at(-1)?.at ?? null, now)}.
          </Note>
        </Card>
      ) : null}

      <Card title="Futures market">
        <StatGrid
          stats={[
            {
              label: '24H volume',
              value: formatUsd(summary.volumeUsd24h),
              note: formatPercent(summary.volumeChange.h24),
              tone: changeTone(summary.volumeChange.h24),
            },
            {
              label: 'Weighted funding',
              value: formatRate(summary.fundingRateByOpenInterest),
              note: `${formatPercent(summary.fundingRateAnnualized)} APR`,
              tone: fundingTone(summary.fundingRateByOpenInterest),
            },
            {
              label: 'OI / 24H volume',
              value: summary.oiVolumeRatio === null ? '—' : summary.oiVolumeRatio.toFixed(2),
              note: 'Higher means positions are held, not churned',
            },
            {
              label: 'OI / market cap',
              value: summary.oiMarketCapRatio === null ? '—' : `${(summary.oiMarketCapRatio * 100).toFixed(2)}%`,
              note: formatUsd(summary.marketCap, 1),
            },
            {
              label: 'Options OI',
              value: formatUsd(summary.optionsOpenInterestUsd),
              note: formatPercent(summary.optionsOpenInterestChangePercent24h),
              tone: changeTone(summary.optionsOpenInterestChangePercent24h),
            },
            {
              label: '24H liquidations',
              value: formatUsd(summary.liquidationUsd24h),
              note: `${formatCount(summary.liquidationCount24h)} positions`,
              tone: 'warning',
            },
          ]}
        />
      </Card>

      <Card title="Taker flow (24H)">
        <SplitBar
          longPercent={longPercent}
          longLabel={`LONG ${longPercent.toFixed(1)}%`}
          shortLabel={`SHORT ${(100 - longPercent).toFixed(1)}%`}
        />
        <Note>
          Long/short ratio {takerLong === null ? '—' : takerLong.toFixed(3)} — taker buy volume against taker sell
          volume across every venue.
        </Note>
      </Card>

      <Card title="Top venues by open interest">
        <VenueList venues={asset.venues} mode="openInterest" limit={5} />
      </Card>

      <View style={[styles.insight, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <AppIcon name="sparkles" color={theme.primary} />
        <View style={styles.insightBody}>
          <ThemedText type="smallBold">What the positioning says</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {positioningNote(
              summary.priceChangePercent24h,
              summary.openInterestChange.h24 ?? null,
              summary.fundingRateByOpenInterest,
            )}
          </ThemedText>
        </View>
      </View>

      {market ? (
        <Card title="Market context">
          <DataRow label="Total futures open interest" value={formatUsd(market.openInterestUsd)} note={formatPercent(market.openInterestChangePercent24h)} tone={changeTone(market.openInterestChangePercent24h)} />
          <DataRow label="Liquidated in 24H" value={formatUsd(market.liquidationUsd24h)} note={formatPercent(market.liquidationChangePercent24h)} tone="warning" />
          <DataRow label="Traders liquidated" value={formatCount(market.tradersLiquidated24h)} />
          <DataRow label="Average RSI" value={market.averageRsi === null ? '—' : market.averageRsi.toFixed(1)} />
        </Card>
      ) : null}
    </>
  );
}

// ------------------------------------------------------------- open interest

export function OpenInterestView({ asset }: ViewProps) {
  const { summary } = asset;
  const perpetual = asset.venues.filter((venue) => venue.perpetual);
  const delivery = asset.venues.filter((venue) => !venue.perpetual);
  const perpetualOi = perpetual.reduce((total, venue) => total + venue.openInterestUsd, 0);
  const deliveryOi = delivery.reduce((total, venue) => total + venue.openInterestUsd, 0);

  return (
    <>
      <KeyMetric
        label="Open interest"
        value={formatUsd(summary.openInterestUsd)}
        change={formatPercent(summary.openInterestChange.h24)}
        tone={changeTone(summary.openInterestChange.h24)}
        note={formatAmount(summary.openInterestAmount, summary.symbol)}
      />

      <Card title="Change by window">
        <WindowStrip values={summary.openInterestChange} windows={OI_WINDOWS} />
        <Divider />
        <WindowStrip
          values={summary.openInterestChangeUsd}
          windows={OI_WINDOWS}
          format={(value) => `${value > 0 ? '+' : '-'}${formatUsd(Math.abs(value), 1).slice(1)}`}
        />
        <Note>Percent change on top, dollars added or removed underneath.</Note>
      </Card>

      <Card title="By venue">
        <VenueList venues={asset.venues} mode="openInterest" limit={14} />
      </Card>

      <Card title="Contract type">
        <DataRow label={`Perpetual swaps (${perpetual.length})`} value={formatUsd(perpetualOi)} />
        <ShareBar percent={perpetualOi + deliveryOi > 0 ? (perpetualOi / (perpetualOi + deliveryOi)) * 100 : 0} />
        <DataRow label={`Dated futures (${delivery.length})`} value={formatUsd(deliveryOi)} />
        <Divider />
        <DataRow label="Options open interest" value={formatUsd(summary.optionsOpenInterestUsd)} note={formatPercent(summary.optionsOpenInterestChangePercent24h)} tone={changeTone(summary.optionsOpenInterestChangePercent24h)} />
        <DataRow label="Options 24H volume" value={formatUsd(summary.optionsVolumeUsd24h)} note={formatPercent(summary.optionsVolumeChangePercent24h)} tone={changeTone(summary.optionsVolumeChangePercent24h)} />
      </Card>

      {asset.netFlows.length ? (
        <Card title="Spot net flow">
          {asset.netFlows.slice(0, 6).map((flow) => (
            <DataRow
              key={flow.window}
              label={flow.window}
              value={`${flow.netUsd > 0 ? '+' : '-'}${formatUsd(Math.abs(flow.netUsd), 1).slice(1)}`}
              note={`${formatUsd(flow.inflowUsd, 1)} in`}
              tone={changeTone(flow.netUsd)}
            />
          ))}
          <Note>Buy volume minus sell volume on spot venues, over each window.</Note>
        </Card>
      ) : null}
    </>
  );
}

// -------------------------------------------------------------------- funding

export function FundingView({ asset, market, now }: ViewProps) {
  const theme = useTheme();
  const { summary } = asset;
  // A funding rate per interval is a number like 0.008%, which plots as a flat
  // line of zeroes. Annualising it — using the interval the series itself
  // implies — gives an axis that reads, and the figure traders actually quote.
  const intervalHours = fundingIntervalHours(asset);
  const history = asset.fundingHistory.map((point) => point.close * (8_760 / intervalHours));
  const paying = (summary.fundingRateByOpenInterest ?? 0) >= 0;

  return (
    <>
      <KeyMetric
        label="OI-weighted funding"
        value={formatRate(summary.fundingRateByOpenInterest)}
        change={fundingVerdict(summary.fundingRateByOpenInterest)}
        tone={fundingTone(summary.fundingRateByOpenInterest)}
        note={`${paying ? 'Longs pay shorts' : 'Shorts pay longs'} · ${formatPercent(summary.fundingRateAnnualized)} annualised`}
      />

      <Card title="Weighting">
        <StatGrid
          stats={[
            { label: 'By open interest', value: formatRate(summary.fundingRateByOpenInterest), tone: fundingTone(summary.fundingRateByOpenInterest) },
            { label: 'By volume', value: formatRate(summary.fundingRateByVolume), tone: fundingTone(summary.fundingRateByVolume) },
            { label: 'Simple average', value: formatRate(summary.fundingRateBySymbol) },
            { label: 'Annualised', value: formatPercent(summary.fundingRateAnnualized) },
          ]}
        />
        <Note>
          Weighting matters: an extreme rate on a venue with no open interest moves the simple average and nothing else.
        </Note>
      </Card>

      {history.length > 3 ? (
        <Card title="Funding history">
          <LineChart points={history} tone={paying ? 'positive' : 'negative'} />
          <Note>
            Annualised percent · {history.length} intervals of {intervalHours}h, most recent{' '}
            {formatAgo(asset.fundingHistory.at(-1)?.at ?? null, now)}.
          </Note>
        </Card>
      ) : null}

      <Card title="By venue">
        <VenueList venues={asset.venues} mode="funding" now={now} limit={14} />
      </Card>

      {market && (market.fundingHighest.length || market.fundingLowest.length) ? (
        <Card title="Market extremes">
          {market.fundingHighest.slice(0, 5).map((entry) => (
            <DataRow
              key={`high-${entry.symbol}-${entry.exchange}`}
              label={`${entry.symbol} · ${entry.exchange}`}
              value={formatRate(entry.fundingRate)}
              tone="positive"
            />
          ))}
          <Divider />
          {market.fundingLowest.slice(0, 5).map((entry) => (
            <DataRow
              key={`low-${entry.symbol}-${entry.exchange}`}
              label={`${entry.symbol} · ${entry.exchange}`}
              value={formatRate(entry.fundingRate)}
              tone="negative"
            />
          ))}
          <Note>
            <ThemedText type="small" style={{ color: theme.textMuted }}>
              The most and least expensive perpetuals to hold anywhere on the market right now.
            </ThemedText>
          </Note>
        </Card>
      ) : null}
    </>
  );
}

// --------------------------------------------------------------- liquidations

export function LiquidationsView({ asset, market, now }: ViewProps) {
  const theme = useTheme();
  const [window, setWindow] = useState<LiquidationWindow>('h24');
  const bucket = asset.liquidations[window];
  const split = asset.liquidationSplit[window];
  const longUsd = bucket?.longUsd ?? split?.longUsd ?? 0;
  const shortUsd = bucket?.shortUsd ?? split?.shortUsd ?? 0;
  const total = bucket?.totalUsd ?? longUsd + shortUsd;
  const percent = longShare(longUsd, shortUsd);

  return (
    <>
      <KeyMetric
        label={`${asset.summary.symbol} liquidations (${WINDOW_LABELS[window]})`}
        value={formatUsd(total)}
        change={bucket?.count ? `${formatCount(bucket.count)} positions` : undefined}
        tone="warning"
      />

      <FilterChips
        items={LIQUIDATION_WINDOWS.map((entry) => WINDOW_LABELS[entry])}
        value={WINDOW_LABELS[window]}
        onChange={(label) => {
          const found = LIQUIDATION_WINDOWS.find((entry) => WINDOW_LABELS[entry] === label);
          if (found) setWindow(found);
        }}
      />

      <Card title="Long versus short">
        <SplitBar
          longPercent={percent}
          longLabel={`LONGS ${formatUsd(longUsd)}`}
          shortLabel={`SHORTS ${formatUsd(shortUsd)}`}
        />
        <DataRow label="Long positions closed" value={formatCount(split?.longCount)} />
        <DataRow label="Short positions closed" value={formatCount(split?.shortCount)} />
        <Note>
          {percent >= 60
            ? 'Longs are being forced out — a downward flush.'
            : percent <= 40
              ? 'Shorts are being squeezed out — an upward flush.'
              : 'Both sides are being cleared out at a similar rate.'}
        </Note>
      </Card>

      <Card title="By venue (24H)">
        <VenueList venues={asset.venues} mode="liquidations" limit={10} />
      </Card>

      {market ? (
        <>
          <Card title="Whole market">
            <StatGrid
              stats={[
                { label: '24H liquidations', value: formatUsd(market.liquidationUsd24h), note: formatPercent(market.liquidationChangePercent24h), tone: 'warning' },
                { label: 'Traders liquidated', value: formatCount(market.tradersLiquidated24h) },
                {
                  label: 'Largest single order',
                  value: formatUsd(market.largestLiquidation?.usd),
                  note: market.largestLiquidation
                    ? `${market.largestLiquidation.symbol} · ${market.largestLiquidation.exchange}`
                    : undefined,
                },
                {
                  label: 'Busiest venue',
                  value: market.liquidationsByExchange[0]?.name ?? '—',
                  note: formatUsd(market.liquidationsByExchange[0]?.totalUsd),
                },
              ]}
            />
          </Card>

          {market.liquidationsByExchange.length ? (
            <Card
              title={`By venue${
                market.liquidationsByExchangeWindow
                  ? ` (${WINDOW_LABELS[market.liquidationsByExchangeWindow]})`
                  : ''
              }`}>
              {market.liquidationsByExchange.slice(0, 8).map((venue) => (
                <View key={venue.name} style={styles.coinRow}>
                  <DataRow
                    label={venue.name}
                    value={formatUsd(venue.totalUsd)}
                    note={venue.longRate === null ? undefined : `${venue.longRate.toFixed(0)}% long`}
                  />
                  <ShareBar percent={venue.share ?? 0} tone="negative" />
                </View>
              ))}
              <Note>Across every coin, not just {asset.summary.symbol}.</Note>
            </Card>
          ) : null}

          {market.liquidationsByCoin.length ? (
            <Card title="Hardest hit coins">
              {market.liquidationsByCoin.slice(0, 8).map((coin) => (
                <View key={coin.name} style={styles.coinRow}>
                  <DataRow
                    label={coin.name}
                    value={formatUsd(coin.totalUsd)}
                    note={`${Math.round(longShare(coin.longUsd, coin.shortUsd))}% long`}
                    tone="negative"
                  />
                  <ShareBar
                    percent={(coin.totalUsd / Math.max(market.liquidationsByCoin[0].totalUsd, 1)) * 100}
                    tone="negative"
                  />
                </View>
              ))}
            </Card>
          ) : null}

          {market.recentLiquidations.length ? (
            <Card title="Live liquidations">
              {market.recentLiquidations.slice(0, 12).map((order) => (
                <View key={`${order.at}-${order.symbol}-${order.usd}`} style={styles.feedRow}>
                  <View style={styles.feedLead}>
                    <View
                      style={[
                        styles.sideDot,
                        { backgroundColor: order.side === 'short' ? theme.negative : theme.positive },
                      ]}
                    />
                    <View style={styles.feedText}>
                      <ThemedText type="smallBold" numberOfLines={1}>
                        {order.symbol} · {order.exchange}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textMuted">
                        {order.side === 'short' ? 'Short liquidated' : 'Long liquidated'} · {formatAgo(order.at, now)}
                      </ThemedText>
                    </View>
                  </View>
                  <ThemedText type="smallBold" style={styles.tabular}>{formatUsd(order.usd)}</ThemedText>
                </View>
              ))}
              <Note>Straight from the CoinGlass liquidation feed, as of the last scrape.</Note>
            </Card>
          ) : null}
        </>
      ) : null}
    </>
  );
}

// ------------------------------------------------------------- liquidity map

export function LiquidityView({
  map,
  loading,
  error,
  unavailable,
  symbol,
  now,
}: {
  map: LiquidityMap | null;
  loading: boolean;
  error: string | null;
  unavailable: boolean;
  symbol: string;
  now: number;
}) {
  const theme = useTheme();

  if (unavailable) {
    return (
      <Card title="Liquidity map">
        <Note>
          CoinGlass publishes its liquidation heatmap for BTC/USDT on the open site only — there is no
          map for {symbol}. Switch to BTC to see it.
        </Note>
      </Card>
    );
  }

  if (error) {
    return (
      <Card title="Liquidity map">
        <ThemedText type="small" style={{ color: theme.warning }}>{error}</ThemedText>
      </Card>
    );
  }

  if (!map) {
    return (
      <Card title="Liquidity map">
        <Note>{loading ? 'Loading the heatmap…' : 'No heatmap captured yet.'}</Note>
      </Card>
    );
  }

  const { above, below } = nearestClusters(map);
  const biggest = map.profile.reduce(
    (most, level) => (level.usd > most.usd ? level : most),
    map.profile[0] ?? { price: 0, usd: 0 },
  );
  const total = map.profile.reduce((sum, level) => sum + level.usd, 0);
  // Two decimals: the nearest cluster is often a fraction of a percent away,
  // and "+0.0%" would read as "right here" when it is not.
  const distance = (price: number | undefined) =>
    price === undefined || map.price === null ? '—' : formatPercent(((price - map.price) / map.price) * 100, 2);

  return (
    <>
      <KeyMetric
        label={`Leverage on the map (${map.symbol})`}
        value={formatUsd(total)}
        change={map.price === null ? undefined : formatPrice(map.price)}
        note={`${map.exchange ?? 'CoinGlass'} ${map.instrumentId ?? ''} · updated ${formatAgo(map.updatedAt, now)}`}
      />

      <Card title="Liquidation heatmap">
        <LiquidityHeatmap map={map} />
        <HeatLegend max={map.maxCell} />
        <Note>
          Brighter is more leverage waiting to be liquidated at that price. The line is price over the
          same window — bands it has not reached are the ones that would feed a move.
        </Note>
      </Card>

      <Card title="Nearest clusters">
        <DataRow
          label={above ? `Above · ${formatPrice(above.price)}` : 'Above'}
          value={formatUsd(above?.usd)}
          note={distance(above?.price)}
          tone="positive"
        />
        <DataRow
          label={below ? `Below · ${formatPrice(below.price)}` : 'Below'}
          value={formatUsd(below?.usd)}
          note={distance(below?.price)}
          tone="negative"
        />
        <Divider />
        <DataRow label="Densest band" value={formatPrice(biggest.price)} note={formatUsd(biggest.usd)} />
        <DataRow
          label="Mapped range"
          value={`${formatPrice(map.rangeLow)} – ${formatPrice(map.rangeHigh)}`}
        />
        <Note>
          A cluster is a price level holding at least a tenth of the densest band on the map, so
          small scatter does not count as a magnet.
        </Note>
      </Card>

      <Card title="Leverage by price">
        {[...map.profile]
          .sort((a, b) => b.usd - a.usd)
          .slice(0, 10)
          .map((level) => (
            <View key={level.price} style={styles.coinRow}>
              <DataRow
                label={formatPrice(level.price)}
                value={formatUsd(level.usd)}
                note={distance(level.price)}
                tone={map.price !== null && level.price > map.price ? 'positive' : 'negative'}
              />
              <ShareBar percent={(level.usd / Math.max(biggest.usd, 1)) * 100} />
            </View>
          ))}
        <Note>The ten densest levels, summed across the window, and how far each sits from price.</Note>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------- positioning

export function PositioningView({ asset }: ViewProps) {
  const theme = useTheme();
  const { summary } = asset;
  const rows: { label: string; ratio: number | null; explain: string }[] = [
    { label: 'All accounts (Binance)', ratio: summary.globalAccountRatio, explain: 'Every account holding a position' },
    { label: 'Top accounts (Binance)', ratio: summary.topAccountRatio, explain: 'The largest accounts, one vote each' },
    { label: 'Top positions (Binance)', ratio: summary.topPositionRatio, explain: 'The largest accounts, weighted by size' },
    { label: 'All accounts (OKX)', ratio: summary.okxGlobalAccountRatio, explain: 'OKX’s equivalent crowd measure' },
  ];

  return (
    <>
      <KeyMetric
        label="Taker long/short (24H)"
        value={summary.longShortRatio.h24 === null ? '—' : (summary.longShortRatio.h24 ?? 0).toFixed(3)}
        change={(summary.longShortRatio.h24 ?? 1) >= 1 ? 'Buyers lifting' : 'Sellers hitting'}
        tone={(summary.longShortRatio.h24 ?? 1) >= 1 ? 'positive' : 'negative'}
        note="Taker buy volume divided by taker sell volume"
      />

      <Card title="Ratio by window">
        <WindowStrip
          values={summary.longShortRatio}
          windows={['m5', 'm15', 'm30', 'h1', 'h4', 'h12', 'h24']}
          format={(value) => value.toFixed(2)}
        />
        <Note>Above 1.00 means more was bought at the ask than sold at the bid.</Note>
      </Card>

      <Card title="Who is positioned which way">
        {rows.map((row) => {
          const percent = ratioToLongPercent(row.ratio);
          return (
            <View key={row.label} style={styles.accountRow}>
              <DataRow
                label={row.label}
                value={row.ratio === null ? '—' : row.ratio.toFixed(2)}
                note={percent === null ? undefined : `${percent.toFixed(1)}% long`}
                tone={row.ratio !== null && row.ratio >= 1 ? 'positive' : 'negative'}
              />
              {percent === null ? null : <SplitBar longPercent={percent} height={6} />}
              <ThemedText type="small" themeColor="textMuted">{row.explain}</ThemedText>
            </View>
          );
        })}
        <Note>
          <ThemedText type="small" style={{ color: theme.textMuted }}>
            Crowd accounts and top positions disagreeing is the classic setup traders watch for.
          </ThemedText>
        </Note>
      </Card>

      <Card title="Taker split by venue">
        <VenueList venues={asset.venues} mode="positioning" limit={12} />
      </Card>

      {Object.keys(summary.rsi).length ? (
        <Card title="RSI">
          <StatGrid
            stats={Object.entries(summary.rsi).map(([window, value]) => ({
              label: window.toUpperCase(),
              value: value.toFixed(1),
              note: value >= 70 ? 'Overbought' : value <= 30 ? 'Oversold' : 'Neutral',
              tone: value >= 70 ? 'negative' : value <= 30 ? 'positive' : 'neutral',
            }))}
          />
        </Card>
      ) : null}
    </>
  );
}

// --------------------------------------------------------------------- market

export function MarketView({
  market,
  available,
  onSelect,
}: {
  market: MarketOverview | null;
  available: string[];
  onSelect: (symbol: string) => void;
}) {
  const theme = useTheme();
  if (!market) {
    return (
      <Card title="Market">
        <Note>No market snapshot yet — the next scrape will fill this in.</Note>
      </Card>
    );
  }

  const biggest = Math.max(...market.screener.map((row) => row.openInterestUsd ?? 0), 1);

  return (
    <>
      <KeyMetric
        label="Total futures open interest"
        value={formatUsd(market.openInterestUsd)}
        change={formatPercent(market.openInterestChangePercent24h)}
        tone={changeTone(market.openInterestChangePercent24h)}
        note={`${market.screener.length} coins tracked`}
      />

      {market.liquidationSeries.length > 3 ? (
        <Card title="Liquidations, hour by hour">
          {/* In millions, so the axis reads as numbers rather than raw dollars. */}
          <LineChart points={market.liquidationSeries.map((value) => value / 1e6)} tone="negative" height={120} />
          <Note>
            USD millions per hour · {formatUsd(market.liquidationUsd24h)} in the last 24 hours,{' '}
            {formatPercent(market.liquidationChangePercent24h)} against the day before.
          </Note>
        </Card>
      ) : null}

      {market.macro.length ? (
        <Card title="Macro">
          <View style={styles.macroGrid}>
            {market.macro.slice(0, 8).map((card) => (
              <View key={card.key} style={styles.macroCell}>
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{card.title}</ThemedText>
                <ThemedText style={styles.macroValue} numberOfLines={1}>
                  {card.display ?? (card.value === null ? '—' : card.value.toFixed(2))}
                </ThemedText>
                <ThemedText type="small" style={{ color: toneColor(theme, changeTone(card.change)) }}>
                  {formatCardChange(card)}
                </ThemedText>
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      <Card title="Every coin by open interest">
        {market.screener.slice(0, 20).map((row) => {
          const selectable = available.includes(row.symbol);
          return (
            <Tap
              key={row.symbol}
              accessibilityRole={selectable ? 'button' : 'text'}
              accessibilityLabel={selectable ? `Show ${row.symbol} derivatives` : row.symbol}
              haptic={selectable ? 'selection' : 'none'}
              onPress={() => selectable && onSelect(row.symbol)}
              style={styles.screenerRow}>
              <View style={styles.screenerHead}>
                <View style={styles.screenerName}>
                  <ThemedText type="smallBold">{row.symbol}</ThemedText>
                  <ThemedText type="small" themeColor="textMuted" numberOfLines={1}>
                    {formatPrice(row.price)} · {formatRate(row.fundingRateByOpenInterest)} funding
                  </ThemedText>
                </View>
                <View style={styles.screenerValues}>
                  <ThemedText type="smallBold" style={styles.tabular}>{formatUsd(row.openInterestUsd)}</ThemedText>
                  <ThemedText
                    type="small"
                    style={[styles.tabular, { color: toneColor(theme, changeTone(row.openInterestChange.h24)) }]}>
                    {formatPercent(row.openInterestChange.h24)}
                  </ThemedText>
                </View>
              </View>
              <ShareBar percent={((row.openInterestUsd ?? 0) / biggest) * 100} />
            </Tap>
          );
        })}
        <Note>Tap a coin the service tracks to switch the breakdown above.</Note>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  insight: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.lg,
    padding: Spacing.four,
  },
  insightBody: { flex: 1, gap: 2 },
  coinRow: { gap: Spacing.one },
  feedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three, minHeight: 34 },
  feedLead: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  sideDot: { width: 6, height: 6, borderRadius: Radius.full },
  feedText: { flex: 1 },
  accountRow: { gap: Spacing.one },
  macroGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: Spacing.four, columnGap: Spacing.three },
  macroCell: { flexGrow: 1, flexBasis: '44%', gap: 1 },
  macroValue: { fontSize: 16, lineHeight: 21, fontWeight: '700', fontVariant: ['tabular-nums'] },
  screenerRow: { gap: Spacing.one, paddingVertical: Spacing.one },
  screenerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three },
  screenerName: { flex: 1 },
  screenerValues: { alignItems: 'flex-end' },
  tabular: { fontVariant: ['tabular-nums'] },
});
