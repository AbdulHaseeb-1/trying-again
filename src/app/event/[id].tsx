import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, {
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAgentPanel } from '@/agent';
import { AppIcon } from '@/components/app-icon';
import { CurrencyBadge, currencyColor } from '@/components/calendar/currency-badge';
import { ImpactMark, impactColor, impactLabel } from '@/components/calendar/impact-mark';
import { ComparisonChart } from '@/components/detail/comparison-chart';
import { GlassBar } from '@/components/detail/glass-bar';
import { GroupedRow, GroupedSection } from '@/components/detail/grouped-list';
import { buildComparison, surprise } from '@/components/detail/value-comparison';
import { Skeleton } from '@/components/skeleton';
import { Screen } from '@/components/screen';
import { TabSwipe } from '@/components/tab-swipe';
import { Tap } from '@/components/tap';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import {
  CURRENCY_NAMES,
  dayKey,
  formatCountdown,
  formatDayLabel,
  formatRelative,
  formatTime,
  type CalendarEvent,
} from '@/data/calendar';
import { useCalendar, useNow } from '@/hooks/use-calendar';
import { useTheme } from '@/hooks/use-theme';

/**
 * Full-screen detail for a single release.
 *
 * Built to iOS conventions rather than the app's card idiom: a translucent bar
 * whose title fades in as the large title scrolls under it, inset grouped
 * lists, and a single dominant number at the top. Everything shown is derived
 * from the release itself — there is no commentary the data does not support.
 */
export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const now = useNow();
  const { data, loading } = useCalendar();
  const [reminded, setReminded] = useState(false);

  const event = useMemo(
    () => data?.events.find((candidate) => candidate.id === id) ?? null,
    [data, id],
  );

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  // The compact title takes over exactly as the large one leaves the frame.
  const compactTitle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [46, 78], [0, 1], 'clamp'),
  }));
  const barBorder = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [46, 78], [0, 1], 'clamp'),
  }));

  const { analyzeRelease } = useAgentPanel();

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/calendar');
  };

  return (
    <Screen>
      <TabSwipe>
          <Animated.ScrollView
            onScroll={onScroll}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[
              styles.content,
              { paddingTop: 52, paddingBottom: Spacing.eight + insets.bottom },
            ]}>
            {event ? (
              <EventBody
                event={event}
                now={now}
                reminded={reminded}
                onToggleReminder={() => setReminded((value) => !value)}
                related={(data?.events ?? []).filter(
                  (candidate) =>
                    candidate.id !== event.id &&
                    candidate.currency === event.currency &&
                    dayKey(candidate.scheduledAt) === dayKey(event.scheduledAt),
                )}
                onOpen={(next) => router.replace(`/event/${next.id}`)}
              />
            ) : loading ? (
              <DetailSkeleton />
            ) : (
              <NotFound onBack={goBack} />
            )}
          </Animated.ScrollView>

          <View style={styles.barSlot} pointerEvents="box-none">
            <GlassBar style={styles.bar}>
              <Tap
                accessibilityRole="button"
                accessibilityLabel="Back to calendar"
                onPress={goBack}
                haptic="none"
                style={styles.back}>
                <AppIcon name="back" size={17} color={theme.primary} />
                <ThemedText style={[styles.backLabel, { color: theme.primary }]}>Calendar</ThemedText>
              </Tap>

              <Animated.View style={[styles.compactTitle, compactTitle]} pointerEvents="none">
                <ThemedText style={styles.compactTitleText} numberOfLines={1}>
                  {event?.title ?? ''}
                </ThemedText>
              </Animated.View>

              {/* The assistant already has a tool for this release; the
                  affordance is just a way to hand it the one on screen. */}
              <Tap
                accessibilityRole="button"
                accessibilityLabel="Ask the assistant about this release"
                onPress={() =>
                  event && analyzeRelease({ id: event.id, title: event.title, currency: event.currency })
                }
                haptic="none"
                style={styles.askButton}>
                <AppIcon name="sparkles" size={17} color={theme.primary} />
              </Tap>

              <Animated.View
                style={[styles.barHairline, { backgroundColor: theme.separator }, barBorder]}
              />
            </GlassBar>
          </View>
      </TabSwipe>
    </Screen>
  );
}

function EventBody({
  event,
  now,
  reminded,
  onToggleReminder,
  related,
  onOpen,
}: {
  event: CalendarEvent;
  now: number;
  reminded: boolean;
  onToggleReminder: () => void;
  related: CalendarEvent[];
  onOpen: (event: CalendarEvent) => void;
}) {
  const theme = useTheme();
  const accent = impactColor(theme, event.impact);
  const scheduled = new Date(event.scheduledAt);
  const upcoming = scheduled.getTime() > now;
  const bars = buildComparison(event);
  const delta = surprise(event);
  const outcomeColor =
    event.outcome === 'better'
      ? theme.positive
      : event.outcome === 'worse'
        ? theme.negative
        : theme.text;

  return (
    <>
      <View style={styles.masthead}>
        <View style={styles.eyebrow}>
          <CurrencyBadge currency={event.currency} />
          <View style={styles.eyebrowImpact}>
            <ImpactMark impact={event.impact} size="large" />
            <ThemedText style={[styles.eyebrowText, { color: accent }]}>
              {impactLabel(event.impact)} impact
            </ThemedText>
          </View>
        </View>

        <ThemedText style={styles.largeTitle}>{event.title}</ThemedText>

        <ThemedText style={[styles.dateline, { color: theme.textSecondary }]}>
          {dateline(event)}
        </ThemedText>
      </View>

      {/* The one number the page exists to show. */}
      <View style={styles.hero}>
        {event.released ? (
          <>
            <ThemedText style={[styles.heroLabel, { color: theme.textMuted }]}>ACTUAL</ThemedText>
            <ThemedText style={[styles.heroValue, { color: outcomeColor }]}>
              {event.actual}
            </ThemedText>
            {delta ? (
              <View style={[styles.deltaPill, { backgroundColor: `${outcomeColor}1C` }]}>
                <ThemedText style={[styles.deltaText, { color: outcomeColor }]}>
                  {delta.text}
                </ThemedText>
              </View>
            ) : null}
          </>
        ) : (
          <>
            <ThemedText style={[styles.heroLabel, { color: theme.textMuted }]}>
              {upcoming ? 'RELEASES IN' : 'AWAITING RELEASE'}
            </ThemedText>
            <ThemedText style={[styles.heroValue, { color: upcoming ? theme.primary : theme.textSecondary }]}>
              {upcoming ? formatCountdown(event.scheduledAt, now) : 'Pending'}
            </ThemedText>
            {upcoming ? (
              <Tap
                accessibilityRole="button"
                accessibilityState={{ selected: reminded }}
                onPress={onToggleReminder}
                haptic="success"
                style={[
                  styles.remind,
                  {
                    borderColor: reminded ? `${theme.positive}80` : 'transparent',
                    backgroundColor: reminded ? `${theme.positive}16` : `${theme.primary}1C`,
                  },
                ]}>
                <AppIcon name="bell" size={15} color={reminded ? theme.positive : theme.primary} />
                <ThemedText
                  style={[styles.remindText, { color: reminded ? theme.positive : theme.primary }]}>
                  {reminded ? 'Reminder on' : 'Remind me'}
                </ThemedText>
              </Tap>
            ) : null}
          </>
        )}
      </View>

      {bars ? (
        <GroupedSection
          header="Comparison"
          footer={
            event.released
              ? 'Actual measured against the consensus forecast and the prior period.'
              : 'Consensus forecast against the prior period. The actual lands at release.'
          }>
          <View style={styles.chartRow}>
            <ComparisonChart bars={bars} tone={outcomeColor} />
          </View>
        </GroupedSection>
      ) : null}

      <GroupedSection header="Release">
        <GroupedRow
          label="Actual"
          value={event.actual}
          tint={event.actual ? outcomeColor : undefined}
        />
        <GroupedRow label="Forecast" value={event.forecast} />
        <GroupedRow
          label="Previous"
          value={event.previous}
          detail={event.revision ? `revised from ${event.revision}` : null}
        />
      </GroupedSection>

      <GroupedSection
        header="Details"
        footer={`${sourceLabel(event.source)} · last updated ${formatRelative(event.updatedAt, now)}.`}>
        <GroupedRow
          label="Currency"
          value={CURRENCY_NAMES[event.currency] ?? event.currency}
          tint={currencyColor(event.currency, theme.textSecondary)}
        />
        <GroupedRow
          label="Impact"
          accessory={
            <View style={styles.impactCell}>
              <ImpactMark impact={event.impact} />
              <ThemedText style={[styles.impactText, { color: accent }]}>
                {impactLabel(event.impact)}
              </ThemedText>
            </View>
          }
        />
        <GroupedRow
          label="Scheduled"
          value={
            event.timePrecision === 'exact'
              ? formatTime(event)
              : event.timePrecision === 'all-day'
                ? 'All day'
                : 'Tentative'
          }
          detail={scheduled.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}
        />
        <GroupedRow
          label="Status"
          value={event.released ? 'Released' : upcoming ? 'Scheduled' : 'Awaiting'}
          tint={event.released ? theme.positive : theme.textSecondary}
        />
        {event.leaked ? <GroupedRow label="Note" value="Released early" tint={theme.warning} /> : null}
      </GroupedSection>

      {related.length ? (
        <GroupedSection header={`Also ${event.currency} that day`}>
          {related.slice(0, 6).map((item) => (
            <GroupedRow
              key={item.id}
              label={item.title}
              value={item.released ? item.actual : formatTime(item)}
              tint={item.released ? theme.text : theme.textSecondary}
              onPress={() => onOpen(item)}
            />
          ))}
        </GroupedSection>
      ) : null}
    </>
  );
}

/**
 * "Today at 12:30" when the relative label carries the date, otherwise the full
 * date — never both, which would read "Mon, Sep 7 · September 7".
 */
function dateline(event: CalendarEvent): string {
  const day = formatDayLabel(dayKey(event.scheduledAt));
  const relative = day === 'Today' || day === 'Tomorrow' || day === 'Yesterday';
  const date = relative
    ? day
    : new Date(event.scheduledAt).toLocaleDateString(undefined, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
  if (event.timePrecision === 'all-day') return `${date} · All day`;
  if (event.timePrecision === 'tentative') return `${date} · Time tentative`;
  return `${date} at ${formatTime(event)}`;
}

function sourceLabel(source: string): string {
  if (source === 'forex-factory-scrape') return 'ForexFactory';
  if (source === 'forex-factory-feed') return 'ForexFactory mirror';
  return source;
}

function NotFound({ onBack }: { onBack: () => void }) {
  const theme = useTheme();
  return (
    <View style={styles.notFound}>
      <AppIcon name="calendar" size={30} color={theme.textMuted} />
      <ThemedText style={styles.notFoundTitle}>Release not available</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.notFoundBody}>
        This release is outside the calendar window the service currently holds.
      </ThemedText>
      <Tap
        accessibilityRole="button"
        onPress={onBack}
        style={[styles.notFoundButton, { backgroundColor: theme.primary }]}>
        <ThemedText type="smallBold" style={{ color: theme.background }}>
          Back to calendar
        </ThemedText>
      </Tap>
    </View>
  );
}

function DetailSkeleton() {
  return (
    <View style={styles.skeleton}>
      <Skeleton style={{ height: 14, width: 120, borderRadius: Radius.full }} />
      <Skeleton style={{ height: 34, width: '85%', borderRadius: 8 }} />
      <Skeleton style={{ height: 34, width: '55%', borderRadius: 8 }} />
      <Skeleton style={{ height: 56, width: 180, borderRadius: 10, marginTop: Spacing.four }} />
      <Skeleton style={{ height: 132, width: '100%', borderRadius: 10, marginTop: Spacing.four }} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: Spacing.four, gap: Spacing.six },

  barSlot: { position: 'absolute', top: 0, left: 0, right: 0 },
  bar: { height: 52, flexDirection: 'row', alignItems: 'center' },
  back: {
    position: 'absolute',
    left: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
    paddingVertical: Spacing.two,
    paddingRight: Spacing.three,
    zIndex: 2,
  },
  backLabel: { fontSize: 16, lineHeight: 21, fontWeight: '400' },
  // Clears the overlapping back button on both sides so the centred title
  // truncates rather than colliding with it.
  compactTitle: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 106,
  },
  compactTitleText: { fontSize: 15, lineHeight: 20, fontWeight: '600', letterSpacing: -0.2 },
  askButton: {
    position: 'absolute',
    right: Spacing.four,
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
  },
  barHairline: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },

  masthead: { gap: Spacing.two, paddingTop: Spacing.three },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  eyebrowImpact: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eyebrowText: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 0.2 },
  largeTitle: { fontSize: 32, lineHeight: 38, fontWeight: '700', letterSpacing: -0.9 },
  dateline: { fontSize: 14, lineHeight: 19, fontWeight: '500' },

  hero: { alignItems: 'flex-start', gap: Spacing.one },
  heroLabel: { fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 1 },
  heroValue: { fontSize: 52, lineHeight: 60, fontWeight: '700', letterSpacing: -2, fontVariant: ['tabular-nums'] },
  deltaPill: {
    marginTop: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: 5,
    borderRadius: Radius.full,
  },
  deltaText: { fontSize: 13, lineHeight: 17, fontWeight: '700' },
  remind: {
    marginTop: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  remindText: { fontSize: 14, lineHeight: 18, fontWeight: '600' },

  chartRow: { paddingHorizontal: Spacing.five, paddingTop: Spacing.two, paddingBottom: Spacing.four },
  impactCell: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  impactText: { fontSize: 16, lineHeight: 21, fontWeight: '500' },

  notFound: { alignItems: 'center', gap: Spacing.two, paddingTop: Spacing.eight },
  notFoundTitle: { fontSize: 19, lineHeight: 24, fontWeight: '700', marginTop: Spacing.two },
  notFoundBody: { textAlign: 'center', maxWidth: 280 },
  notFoundButton: {
    marginTop: Spacing.four,
    paddingHorizontal: Spacing.six,
    paddingVertical: Spacing.three,
    borderRadius: Radius.full,
  },
  skeleton: { gap: Spacing.three, paddingTop: Spacing.three },
});
