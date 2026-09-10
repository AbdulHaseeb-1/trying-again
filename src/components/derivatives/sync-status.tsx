import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { formatAgo, type DerivativesResponse } from '@/data/derivatives';
import { useTheme } from '@/hooks/use-theme';

/**
 * One honest line about freshness.
 *
 * It says when the numbers were captured and whether the last scrape actually
 * succeeded, because "scraped a minute ago" and "last good scrape was an hour
 * ago, everything since has failed" are very different claims to make about a
 * number someone might trade on.
 */
export function SyncStatus({
  data,
  live,
  now,
}: {
  data: DerivativesResponse;
  live: boolean;
  now: number;
}) {
  const theme = useTheme();
  const sync = data.lastSync;
  const failed = sync ? !sync.ok : false;
  const partial = Boolean(sync?.ok && sync.pagesOk < sync.pagesAttempted);
  const color = failed ? theme.warning : live ? theme.positive : theme.textMuted;

  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <ThemedText style={[styles.text, { color: theme.textMuted }]} numberOfLines={1}>
        {describe(data, now)}
      </ThemedText>
      {partial ? (
        <ThemedText style={[styles.text, { color: theme.warning }]} numberOfLines={1}>
          · {sync!.pagesOk}/{sync!.pagesAttempted} pages
        </ThemedText>
      ) : null}
    </View>
  );
}

function describe(data: DerivativesResponse, now: number): string {
  const sync = data.lastSync;
  if (!sync) {
    return data.capturedAt ? `CoinGlass · cached ${formatAgo(data.capturedAt, now)}` : 'Waiting for first scrape';
  }
  if (!sync.ok) return `Scrape failed ${formatAgo(sync.startedAt, now)} · showing last good data`;
  return `CoinGlass · scraped ${formatAgo(data.capturedAt ?? sync.startedAt, now)}`;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontSize: 11, lineHeight: 15, fontWeight: '600' },
});
