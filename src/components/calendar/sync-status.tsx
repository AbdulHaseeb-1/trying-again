import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { formatRelative, type CalendarResponse } from '@/data/calendar';
import { useTheme } from '@/hooks/use-theme';

/**
 * One honest line about data freshness.
 *
 * It names the source that actually answered, because "live scrape" and
 * "cached snapshot because the scrape is blocked" are very different claims to
 * make about a number someone might trade on.
 */
export function SyncStatus({
  data,
  live,
  now,
}: {
  data: CalendarResponse;
  live: boolean;
  now: number;
}) {
  const theme = useTheme();
  const sync = data.lastSync;
  const failed = sync ? !sync.ok : false;
  const stale = !sync?.ok && Boolean(data.snapshotCapturedAt);

  const color = failed ? theme.warning : live ? theme.positive : theme.textMuted;
  const label = describe(data, now);

  return (
    <View style={styles.row}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <ThemedText style={[styles.text, { color: theme.textMuted }]} numberOfLines={1}>
        {label}
      </ThemedText>
      {stale ? (
        <ThemedText style={[styles.text, { color: theme.warning }]} numberOfLines={1}>
          · cached
        </ThemedText>
      ) : null}
    </View>
  );
}

function describe(data: CalendarResponse, now: number): string {
  const sync = data.lastSync;
  if (!sync) return 'Waiting for first sync';
  if (!sync.ok) {
    return `Sync failed ${formatRelative(sync.startedAt, now)}`;
  }
  const source = sync.source === 'forex-factory-scrape' ? 'ForexFactory' : 'FF mirror';
  return `${data.count} events · ${source} · updated ${formatRelative(sync.startedAt, now)}`;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dot: { width: 6, height: 6, borderRadius: 3 },
  text: { fontSize: 11, lineHeight: 15, fontWeight: '600' },
});
