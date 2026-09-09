import { StyleSheet, View } from 'react-native';

import { AppIcon } from '@/components/app-icon';
import { Tap } from '@/components/tap';
import { ThemedText } from '@/components/themed-text';
import { CurrencyBadge } from '@/components/calendar/currency-badge';
import { ImpactMark, impactColor, impactLabel } from '@/components/calendar/impact-mark';
import { Radius, Spacing } from '@/constants/theme';
import { formatCountdown, formatTime, type CalendarEvent } from '@/data/calendar';
import { useTheme } from '@/hooks/use-theme';

/**
 * The one thing worth pulling out of the list: what prints next, and when.
 *
 * Everything on this card is derived from the same event that also appears in
 * the list below, so it adds emphasis rather than a second source of truth.
 */
export function NextReleaseCard({
  event,
  now,
  reminded,
  onToggleReminder,
}: {
  event: CalendarEvent;
  now: number;
  reminded: boolean;
  onToggleReminder: () => void;
}) {
  const theme = useTheme();
  const accent = impactColor(theme, event.impact);
  const imminent = new Date(event.scheduledAt).getTime() - now < 15 * 60_000;

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.topline}>
        <View style={styles.toplineLeft}>
          <AppIcon name="clock" size={13} color={theme.textMuted} />
          <ThemedText style={[styles.eyebrow, { color: theme.textMuted }]}>NEXT RELEASE</ThemedText>
        </View>
        <View style={[styles.impactPill, { backgroundColor: `${accent}1C` }]}>
          <ImpactMark impact={event.impact} />
          <ThemedText style={[styles.impactText, { color: accent }]}>
            {impactLabel(event.impact)}
          </ThemedText>
        </View>
      </View>

      <View style={styles.identity}>
        <CurrencyBadge currency={event.currency} />
        <ThemedText style={styles.title} numberOfLines={2}>
          {event.title}
        </ThemedText>
      </View>

      <View style={styles.countdownRow}>
        <ThemedText
          style={[styles.countdown, { color: imminent ? theme.warning : theme.primary }]}
          accessibilityLabel={`Releases in ${formatCountdown(event.scheduledAt, now)}`}>
          {formatCountdown(event.scheduledAt, now)}
        </ThemedText>
        <ThemedText type="small" themeColor="textMuted" style={styles.clock}>
          at {formatTime(event)}
        </ThemedText>
      </View>

      <View style={[styles.footer, { borderTopColor: theme.border }]}>
        {/* Speeches and holidays carry no numbers; two em-dashes would be noise. */}
        {event.forecast || event.previous ? (
          <>
            <Stat label="Forecast" value={event.forecast} />
            <Stat label="Previous" value={event.previous} />
          </>
        ) : null}
        <Tap
          accessibilityRole="button"
          accessibilityState={{ selected: reminded }}
          accessibilityLabel={reminded ? 'Remove reminder' : `Remind me before ${event.title}`}
          onPress={onToggleReminder}
          haptic="success"
          style={[
            styles.remind,
            {
              borderColor: reminded ? `${theme.positive}80` : theme.borderStrong,
              backgroundColor: reminded ? `${theme.positive}16` : 'transparent',
            },
          ]}>
          <AppIcon name="bell" size={15} color={reminded ? theme.positive : theme.textSecondary} />
          <ThemedText
            style={[styles.remindText, { color: reminded ? theme.positive : theme.textSecondary }]}>
            {reminded ? 'Reminder on' : 'Remind me'}
          </ThemedText>
        </Tap>
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string | null }) {
  const theme = useTheme();
  return (
    <View style={styles.stat}>
      <ThemedText style={[styles.statLabel, { color: theme.textMuted }]}>{label}</ThemedText>
      <ThemedText style={styles.statValue}>{value ?? '—'}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.lg,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  topline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toplineLeft: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  eyebrow: { fontSize: 10, lineHeight: 13, fontWeight: '800', letterSpacing: 0.8 },
  impactPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  impactText: { fontSize: 10, lineHeight: 13, fontWeight: '800', letterSpacing: 0.4 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: 2 },
  title: { flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '700', letterSpacing: -0.2 },
  countdownRow: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.two },
  countdown: { fontSize: 30, lineHeight: 35, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -1 },
  clock: { fontSize: 12, fontVariant: ['tabular-nums'] },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.five,
    paddingTop: Spacing.three,
    marginTop: Spacing.one,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  stat: { gap: 1 },
  statLabel: { fontSize: 9, lineHeight: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  statValue: { fontSize: 14, lineHeight: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  remind: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 32,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  remindText: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
});
