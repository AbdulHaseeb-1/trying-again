import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, SectionList, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/app-icon';
import { CalendarFilters, type CalendarFilterState } from '@/components/calendar/calendar-filters';
import { DayHeader } from '@/components/calendar/day-header';
import { EventRow } from '@/components/calendar/event-row';
import { NextReleaseCard } from '@/components/calendar/next-release-card';
import { SyncStatus } from '@/components/calendar/sync-status';
import { EmptyState } from '@/components/market-ui';
import { Skeleton } from '@/components/skeleton';
import { Tap } from '@/components/tap';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { dayKey, impactRank, type CalendarEvent } from '@/data/calendar';
import { useCalendar, useNow } from '@/hooks/use-calendar';
import { useTheme } from '@/hooks/use-theme';

const EMPTY_FILTERS: CalendarFilterState = { minImpact: null, currencies: [] };

/**
 * The economic calendar.
 *
 * Structure, top to bottom: what prints next, how to narrow the list, then the
 * list itself grouped into sticky days. Each piece appears exactly once — the
 * screen it replaced showed a filter row and a filter sheet, a section title
 * and a duplicate count badge, and two unrelated content types stacked
 * together.
 */
export default function CalendarScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const now = useNow();
  const {
    data,
    error,
    loading,
    refreshing,
    live,
    refresh,
    history,
    loadingHistory,
    historyError,
    historyExhausted,
    canLoadEarlier,
    loadEarlier,
  } = useCalendar();

  const [filters, setFilters] = useState<CalendarFilterState>(EMPTY_FILTERS);
  const [reminders, setReminders] = useState<string[]>([]);

  const openEvent = useCallback(
    (event: CalendarEvent) => router.push(`/event/${event.id}`),
    [router],
  );

  const events = useMemo(() => {
    if (!data) return [];
    // History sits in front of the live window; the two never overlap, since
    // each page is fetched strictly before what is already loaded.
    return [...history, ...data.events].filter((event) => {
      if (filters.minImpact && impactRank(event.impact) < impactRank(filters.minImpact)) return false;
      if (filters.currencies.length && !filters.currencies.includes(event.currency)) return false;
      return true;
    });
  }, [data, history, filters]);

  // Group in the device's timezone so "Today" matches the user's day, not UTC's.
  const sections = useMemo(() => {
    const byDay = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = dayKey(event.scheduledAt);
      const bucket = byDay.get(key);
      if (bucket) bucket.push(event);
      else byDay.set(key, [event]);
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, dayEvents]) => ({ date, data: dayEvents }));
  }, [events]);

  // Only highlight the next release when the current filters actually show it.
  const nextRelease = useMemo(() => {
    const candidate = data?.nextRelease ?? null;
    if (!candidate) return null;
    return events.some((event) => event.id === candidate.id) ? candidate : null;
  }, [data, events]);

  const toggleReminder = useCallback((id: string) => {
    setReminders((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );
  }, []);

  const filtered = filters.minImpact !== null || filters.currencies.length > 0;

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      {/* Constrained and centred like every other tab, so the value columns
          stay next to the event titles on tablets and the web. */}
      <View style={styles.column}>
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled
          contentContainerStyle={[styles.content, { paddingBottom: 128 + insets.bottom }]}
          showsVerticalScrollIndicator={false}
          initialNumToRender={16}
          windowSize={9}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.primary} />
          }
          ListHeaderComponent={
            <View style={styles.header}>
              <View style={styles.titleRow}>
                <View style={styles.titleBlock}>
                  <ThemedText style={styles.screenTitle}>Calendar</ThemedText>
                  {data ? <SyncStatus data={data} live={live} now={now} /> : null}
                </View>
                <Tap
                  accessibilityRole="button"
                  accessibilityLabel="Refresh calendar"
                  onPress={refresh}
                  haptic="none"
                  style={[styles.iconButton, { borderColor: theme.border }]}>
                  <AppIcon name="trend" size={16} color={theme.textSecondary} />
                </Tap>
              </View>

              {error ? <ErrorNotice message={error} onRetry={refresh} /> : null}

              {loading && !data ? <CalendarSkeleton /> : null}

              {nextRelease ? (
                <NextReleaseCard
                  event={nextRelease}
                  now={now}
                  reminded={reminders.includes(nextRelease.id)}
                  onToggleReminder={() => toggleReminder(nextRelease.id)}
              />
            ) : null}

            <CalendarFilters value={filters} onChange={setFilters} />

            {data ? (
              <LoadEarlier
                available={canLoadEarlier}
                loading={loadingHistory}
                error={historyError}
                exhausted={historyExhausted}
                loaded={history.length}
                onPress={loadEarlier}
              />
            ) : null}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <DayHeader date={section.date} count={section.data.length} />
        )}
        renderItem={({ item }) => (
          <EventRow
            event={item}
            isNext={item.id === nextRelease?.id}
            isPast={new Date(item.scheduledAt).getTime() < now}
            onSelect={openEvent}
          />
        )}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <EmptyState
                icon="calendar"
                title={filtered ? 'Nothing matches' : 'No events loaded'}
                body={
                  filtered
                    ? 'No releases in the window match this impact and currency selection.'
                    : 'The calendar service has not returned any events for this window yet.'
                }
                action={filtered ? 'Clear filters' : 'Retry'}
                onAction={filtered ? () => setFilters(EMPTY_FILTERS) : refresh}
              />
            </View>
          )
        }
        />
      </View>

    </View>
  );
}

/**
 * The way into the archive.
 *
 * The live window only reaches two days back — everything before that is in the
 * service's database, and this is the one control that asks for it. It stays
 * visible but inert when the service is running without an archive, because
 * "there is no history here" is a more useful answer than a button that does
 * nothing.
 */
function LoadEarlier({
  available,
  loading,
  error,
  exhausted,
  loaded,
  onPress,
}: {
  available: boolean;
  loading: boolean;
  error: string | null;
  exhausted: boolean;
  loaded: number;
  onPress: () => void;
}) {
  const theme = useTheme();
  if (!available && !error) return null;
  const done = exhausted && !loading;

  return (
    <View style={styles.earlier}>
      <Tap
        accessibilityRole="button"
        accessibilityLabel="Load earlier releases"
        accessibilityState={{ disabled: loading }}
        onPress={loading || done ? undefined : onPress}
        haptic="none"
        style={[styles.earlierButton, { borderColor: theme.border, backgroundColor: theme.surface }]}>
        <AppIcon name="clock" size={14} color={theme.textSecondary} />
        <ThemedText type="smallBold" themeColor={loading || done ? 'textMuted' : 'text'}>
          {loading ? 'Loading history…' : 'Load earlier releases'}
        </ThemedText>
      </Tap>
      {loaded > 0 && !loading ? (
        <ThemedText type="small" themeColor="textMuted">
          {loaded} past {loaded === 1 ? 'release' : 'releases'} from the archive
        </ThemedText>
      ) : null}
      {done ? (
        <ThemedText type="small" themeColor="textMuted">
          {loaded > 0 ? 'That is everything the archive holds.' : 'Nothing older in the archive yet.'}
        </ThemedText>
      ) : null}
      {error ? (
        <ThemedText type="small" style={{ color: theme.warning }}>
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

function ErrorNotice({ message, onRetry }: { message: string; onRetry: () => void }) {
  const theme = useTheme();
  return (
    <View style={[styles.error, { borderColor: `${theme.warning}55`, backgroundColor: `${theme.warning}12` }]}>
      <AppIcon name="info" size={16} color={theme.warning} />
      <ThemedText type="small" style={[styles.errorText, { color: theme.warning }]}>
        {message}
      </ThemedText>
      <Tap accessibilityRole="button" onPress={onRetry} haptic="none" style={styles.errorAction}>
        <ThemedText type="smallBold" style={{ color: theme.warning }}>
          Retry
        </ThemedText>
      </Tap>
    </View>
  );
}

function CalendarSkeleton() {
  const theme = useTheme();
  return (
    <View style={[styles.skeleton, { borderColor: theme.border, backgroundColor: theme.card }]}>
      <Skeleton style={{ height: 12, width: 90, borderRadius: Radius.full }} />
      <Skeleton style={{ height: 26, width: '70%', borderRadius: 6 }} />
      <Skeleton style={{ height: 34, width: 140, borderRadius: 6 }} />
      <View style={styles.skeletonRow}>
        <Skeleton style={{ height: 16, width: 60, borderRadius: 4 }} />
        <Skeleton style={{ height: 16, width: 60, borderRadius: 4 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', justifyContent: 'center' },
  column: { flex: 1, width: '100%', maxWidth: MaxContentWidth },
  content: { paddingTop: Spacing.four },
  header: { gap: Spacing.three, paddingHorizontal: Spacing.three, paddingBottom: Spacing.two },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  titleBlock: { gap: 3, flex: 1 },
  screenTitle: { fontSize: 24, lineHeight: 29, fontWeight: '800', letterSpacing: -0.6 },
  iconButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  error: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  errorText: { flex: 1, fontSize: 12, lineHeight: 16 },
  errorAction: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
  empty: { paddingHorizontal: Spacing.three, paddingTop: Spacing.six },
  earlier: { alignItems: 'center', gap: Spacing.one, paddingTop: Spacing.two },
  earlierButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    minHeight: 34,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  skeleton: {
    gap: Spacing.two,
    padding: Spacing.four,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  skeletonRow: { flexDirection: 'row', gap: Spacing.three, marginTop: Spacing.one },
  sheet: { gap: Spacing.three },
  sheetMeta: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, flexWrap: 'wrap' },
  sheetImpact: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sheetWhen: { fontSize: 12, marginLeft: 'auto' },
  sheetValues: {
    flexDirection: 'row',
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
  },
  sheetValue: { flex: 1, gap: 2 },
  sheetValueLabel: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  sheetValueText: { fontSize: 17, lineHeight: 22, fontWeight: '800', fontVariant: ['tabular-nums'] },
  sheetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    minHeight: 44,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
