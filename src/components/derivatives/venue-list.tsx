import { StyleSheet, View } from 'react-native';

import { ShareBar, SplitBar } from '@/components/derivatives/primitives';
import { toneColor } from '@/components/market-ui';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import {
  changeTone,
  fundingTone,
  formatPercent,
  formatRate,
  formatUsd,
  formatUntil,
  longShare,
  type Venue,
} from '@/data/derivatives';
import { useTheme } from '@/hooks/use-theme';

export type VenueMode = 'openInterest' | 'funding' | 'positioning' | 'liquidations';

/**
 * The venue table, in four readings of the same rows.
 *
 * CoinGlass gives every measure per contract, so one component covers all of
 * them rather than four tables that differ only in which column is bold.
 */
export function VenueList({
  venues,
  mode,
  now,
  limit = 12,
}: {
  venues: Venue[];
  mode: VenueMode;
  now?: number;
  limit?: number;
}) {
  const theme = useTheme();
  const shown = venues.slice(0, limit);
  const largest = Math.max(...shown.map((venue) => primaryWeight(venue, mode)), 1);

  return (
    <View style={styles.list}>
      {shown.map((venue) => (
        <View key={`${venue.exchange}-${venue.symbol}`} style={styles.row}>
          <View style={styles.head}>
            <View style={styles.name}>
              <ThemedText type="smallBold" numberOfLines={1}>{venue.exchange}</ThemedText>
              <ThemedText type="small" themeColor="textMuted" numberOfLines={1}>
                {venue.symbol}
                {venue.perpetual ? '' : ' · futures'}
              </ThemedText>
            </View>
            <View style={styles.values}>{primary(venue, mode, theme, now)}</View>
          </View>
          {mode === 'positioning' && venue.longRate !== null ? (
            <SplitBar longPercent={venue.longRate} height={6} />
          ) : mode === 'funding' ? (
            // Funding rates across venues differ by too little for a share bar
            // to say anything a single outlier would not flatten.
            null
          ) : (
            <ShareBar
              percent={(primaryWeight(venue, mode) / largest) * 100}
              tone={mode === 'liquidations' ? 'negative' : 'positive'}
            />
          )}
        </View>
      ))}
      {venues.length > shown.length ? (
        <ThemedText type="small" themeColor="textMuted">
          + {venues.length - shown.length} more venues tracked
        </ThemedText>
      ) : null}
    </View>
  );
}

function primaryWeight(venue: Venue, mode: VenueMode): number {
  if (mode === 'liquidations') {
    return (venue.longLiquidationUsd24h ?? 0) + (venue.shortLiquidationUsd24h ?? 0);
  }
  if (mode === 'positioning') return venue.longRate ?? 0;
  return venue.openInterestUsd;
}

function primary(venue: Venue, mode: VenueMode, theme: ReturnType<typeof useTheme>, now?: number) {
  if (mode === 'funding') {
    return (
      <>
        <ThemedText type="smallBold" style={[styles.tabular, { color: toneColor(theme, fundingTone(venue.fundingRate)) }]}>
          {formatRate(venue.fundingRate)}
        </ThemedText>
        <ThemedText type="small" themeColor="textMuted" style={styles.tabular}>
          {venue.fundingIntervalHours ? `${venue.fundingIntervalHours}h · ` : ''}
          {formatUntil(venue.nextFundingAt, now)}
        </ThemedText>
      </>
    );
  }

  if (mode === 'liquidations') {
    const long = venue.longLiquidationUsd24h ?? 0;
    const short = venue.shortLiquidationUsd24h ?? 0;
    return (
      <>
        <ThemedText type="smallBold" style={styles.tabular}>{formatUsd(long + short)}</ThemedText>
        <ThemedText type="small" themeColor="textMuted" style={styles.tabular}>
          {long + short > 0 ? `${Math.round(longShare(long, short))}% long` : 'none'}
        </ThemedText>
      </>
    );
  }

  if (mode === 'positioning') {
    return (
      <>
        <ThemedText type="smallBold" style={[styles.tabular, { color: theme.positive }]}>
          {venue.longRate === null ? '—' : `${venue.longRate.toFixed(1)}% long`}
        </ThemedText>
        <ThemedText type="small" themeColor="textMuted" style={styles.tabular}>
          {formatUsd(venue.volumeUsd24h)} vol
        </ThemedText>
      </>
    );
  }

  return (
    <>
      <ThemedText type="smallBold" style={styles.tabular}>{formatUsd(venue.openInterestUsd)}</ThemedText>
      <ThemedText
        type="small"
        style={[styles.tabular, { color: toneColor(theme, changeTone(venue.openInterestChangePercent24h)) }]}>
        {formatPercent(venue.openInterestChangePercent24h)}
      </ThemedText>
    </>
  );
}

const styles = StyleSheet.create({
  list: { gap: Spacing.three },
  row: { gap: Spacing.one },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three },
  name: { flex: 1, gap: 0 },
  values: { alignItems: 'flex-end', gap: 0 },
  tabular: { fontVariant: ['tabular-nums'] },
});
