import { useEffect, useMemo, useState } from 'react';
import type { DimensionValue } from 'react-native';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { AppIcon } from '@/components/app-icon';
import { BottomSheet } from '@/components/bottom-sheet';
import { Tap } from '@/components/tap';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import {
  computeSessionState,
  formatMinutesHuman,
  GLOBAL_SESSIONS,
  SESSION_VARIANTS,
  type CurrentSessionState,
  type MarketSession,
  type SessionGlance,
  type SessionId,
  type SessionTone,
  type VariantId
} from '@/data/sessions';
import { useTheme } from '@/hooks/use-theme';

function getSessionColor(theme: ReturnType<typeof useTheme>, tone: SessionTone) {
  if (tone === 'positive') return theme.positive;
  if (tone === 'negative') return theme.negative;
  if (tone === 'warning') return theme.warning;
  if (tone === 'primary') return theme.primary;
  if (tone === 'secondary') return theme.secondary;
  return theme.textSecondary;
}

const CITY_TIMEZONES: Record<SessionId, string> = {
  sydney: 'Australia/Sydney',
  tokyo: 'Asia/Tokyo',
  london: 'Europe/London',
  newyork: 'America/New_York',
};

function formatZonedTime(now: Date, timeZone?: string): { time: string; day: string; abbrev: string } {
  try {
    const timeFmt = new Intl.DateTimeFormat('en-GB', {
      ...(timeZone ? { timeZone } : null),
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const dayFmt = new Intl.DateTimeFormat('en-US', {
      ...(timeZone ? { timeZone } : null),
      weekday: 'short',
    });
    const abbrevFmt = new Intl.DateTimeFormat('en-US', {
      ...(timeZone ? { timeZone } : null),
      hour: '2-digit',
      timeZoneName: 'short',
    });
    const abbrev = abbrevFmt.formatToParts(now).find((p) => p.type === 'timeZoneName')?.value ?? '';
    return { time: timeFmt.format(now), day: dayFmt.format(now), abbrev };
  } catch {
    return { time: now.toLocaleTimeString(), day: '', abbrev: '' };
  }
}

export function WorldClockSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [visible]);

  const localTimeZone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'Local time';
    } catch {
      return 'Local time';
    }
  }, []);

  const sessionGlances = useMemo(
    () => computeSessionState(now).sessionGlances,
    [now],
  );

  const glanceById = useMemo(() => new Map(sessionGlances.map((g) => [g.session.id, g])), [sessionGlances]);

  const utc = formatZonedTime(now, 'UTC');
  const local = formatZonedTime(now, undefined);
  const et = formatZonedTime(now, 'America/New_York');

  const cityRows = (['sydney', 'tokyo', 'london', 'newyork'] as SessionId[]).map((id) => {
    const glance = glanceById.get(id);
    const session = glance?.session ?? GLOBAL_SESSIONS.find((s) => s.id === id)!;
    const zoned = formatZonedTime(now, CITY_TIMEZONES[id]);
    return { id, session, glance, zoned };
  });

  return (
    <BottomSheet visible={visible} title="Live world clock" onClose={onClose}>
      <ScrollView showsVerticalScrollIndicator={false} style={styles.sheetScroll} contentContainerStyle={styles.clockSheetList}>
        <ThemedText type="small" themeColor="textMuted" style={styles.clockSheetNote}>
          Live • updates every second
        </ThemedText>

        {/* My current time + UTC + ET */}
        <View style={[styles.clockRow, { borderBottomColor: theme.border }]}>
          <View style={styles.clockLeft}>
            <ThemedText style={styles.clockFlag}>📍</ThemedText>
            <View style={styles.clockCityWrap}>
              <ThemedText type="smallBold" style={styles.clockCity}>My time</ThemedText>
              <ThemedText type="small" themeColor="textMuted" style={styles.clockSub}>{localTimeZone}</ThemedText>
            </View>
          </View>
          <View style={styles.clockRight}>
            <ThemedText style={styles.clockTime}>{local.time}</ThemedText>
            <ThemedText type="small" themeColor="textMuted" style={styles.clockAbbrev}>{local.day} {local.abbrev}</ThemedText>
          </View>
        </View>

        <View style={[styles.clockRow, { borderBottomColor: theme.border }]}>
          <View style={styles.clockLeft}>
            <ThemedText style={styles.clockFlag}>🌐</ThemedText>
            <View style={styles.clockCityWrap}>
              <ThemedText type="smallBold" style={styles.clockCity}>UTC</ThemedText>
              <ThemedText type="small" themeColor="textMuted" style={styles.clockSub}>Coordinated Universal</ThemedText>
            </View>
          </View>
          <View style={styles.clockRight}>
            <ThemedText style={styles.clockTime}>{utc.time}</ThemedText>
            <ThemedText type="small" themeColor="textMuted" style={styles.clockAbbrev}>{utc.day} UTC</ThemedText>
          </View>
        </View>

        <View style={[styles.clockRow, { borderBottomColor: theme.border }]}>
          <View style={styles.clockLeft}>
            <ThemedText style={styles.clockFlag}>🇺🇸</ThemedText>
            <View style={styles.clockCityWrap}>
              <ThemedText type="smallBold" style={styles.clockCity}>Eastern • ET</ThemedText>
              <ThemedText type="small" themeColor="textMuted" style={styles.clockSub}>New York session</ThemedText>
            </View>
          </View>
          <View style={styles.clockRight}>
            <ThemedText style={styles.clockTime}>{et.time}</ThemedText>
            <ThemedText type="small" themeColor="textMuted" style={styles.clockAbbrev}>{et.day} {et.abbrev}</ThemedText>
          </View>
        </View>

        {/* Major session cities */}
        {cityRows.map(({ id, session, glance, zoned }, index) => {
          const isOpen = glance?.isOpen ?? false;
          const dotColor = isOpen ? theme.positive : glance?.isOpeningSoon ? theme.warning : theme.textMuted;
          const isLast = index === cityRows.length - 1;
          return (
            <View key={id} style={[styles.clockRow, isLast && styles.clockRowLast, { borderBottomColor: theme.border }]}>
              <View style={styles.clockLeft}>
                <ThemedText style={styles.clockFlag}>{session.flag}</ThemedText>
                <View style={styles.clockCityWrap}>
                  <View style={styles.clockCityRow}>
                    <ThemedText type="smallBold" style={styles.clockCity}>{session.city}</ThemedText>
                    <View style={[styles.statusDot, { backgroundColor: dotColor }]} />
                  </View>
                  <ThemedText type="small" themeColor="textMuted" style={styles.clockSub}>
                    {glance ? `${glance.statusText} • ${glance.countdown}` : session.code}
                  </ThemedText>
                </View>
              </View>
              <View style={styles.clockRight}>
                <ThemedText style={styles.clockTime}>{zoned.time}</ThemedText>
                <ThemedText type="small" themeColor="textMuted" style={styles.clockAbbrev}>{zoned.day} {zoned.abbrev}</ThemedText>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </BottomSheet>
  );
}

export function MarketSessionBanner({
  onExploreVariants,
  onPressClock,
}: {
  onExploreVariants?: () => void;
  onPressClock?: () => void;
}) {
  const theme = useTheme();
  const [clockTick, setClockTick] = useState(() => Date.now());

  // Refresh clock and countdowns every 30 seconds
  useEffect(() => {
    const timer = setInterval(() => setClockTick(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const sessionState: CurrentSessionState = useMemo(() => {
    // We reference clockTick so useMemo recalculates every tick
    void clockTick;
    return computeSessionState(new Date());
  }, [clockTick]);

  const { activeVariant, progressPercent, minutesRemainingInVariant, timeStringUtc, timeStringLocal, dateLabel, sessionGlances } = sessionState;
  const accentColor = getSessionColor(theme, activeVariant.iconTone);

  return (
    <View style={[styles.container, { backgroundColor: theme.card, borderColor: theme.border }]}>
      {/* Top Meta Bar */}
      <View style={styles.topMeta}>
        <View style={styles.sectionHeaderRow}>
          <AppIcon name="globe" size={15} color={theme.text} />
          <ThemedText type="smallBold" style={styles.sectionHeaderText}>
            Trading Sessions
          </ThemedText>
        </View>

        <Tap
          accessibilityRole="button"
          accessibilityLabel="Show live world clock"
          accessibilityHint="Shows UTC, Eastern, local and session city times"
          onPress={onPressClock}
          style={[styles.clockContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <AppIcon name="clock" size={13} color={theme.textMuted} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.clockText}>
            {timeStringUtc} <ThemedText type="small" themeColor="textMuted">({timeStringLocal})</ThemedText>
          </ThemedText>
        </Tap>
      </View>

      {/* Main Title and Timing Section */}
      {/* <View style={styles.titleSection}>
        <ThemedText style={styles.variantTitle}>{activeVariant.title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.timeRangeText}>
          {activeVariant.utcTimeRange}  •  {dateLabel}
        </ThemedText>
      </View> */}

      {/* Status & Countdown Row */}
      {/* <View style={styles.statusCountdownRow}> */}
        {/* <View style={styles.statusPill}>
          <LivePulseDot color={accentColor} size={6} pulsing={true} />
          <ThemedText type="smallBold" style={{ color: accentColor, fontSize: 12 }}>
            {activeVariant.isWeekendOnly ? '24/7 Digital Flow' : 'Active Session'}
          </ThemedText>
        </View> */}

        {/* <View style={styles.countdownInline}>
          <ThemedText style={[styles.countdownLabel, { color: accentColor }]}>
            {activeVariant.isWeekendOnly ? '24/7 Live' : `Closes in ${formatMinutesHuman(minutesRemainingInVariant)}`}
          </ThemedText>
          <ThemedText type="small" themeColor="textMuted" style={styles.countdownSub}>
            ({progressPercent}% elapsed)
          </ThemedText>
        </View> */}
      {/* </View> */}

      {/* Global exchanges session timeline */}
      <SessionTimeline
        glances={sessionGlances}
        onPress={onExploreVariants}
      />

    
  </View>
  );
}

function sessionBarColor(theme: ReturnType<typeof useTheme>, id: SessionId): string {
  switch (id) {
    case 'sydney':
      return '#A78BFA';
    case 'tokyo':
      return '#F59E0B';
    case 'london':
      return '#10B981';
    case 'newyork':
      return '#38BDF8';
  }
}

function blockElapsedFraction(nowLin: number, a: number, b: number): number {
  if (b <= a) return 0;
  return Math.min(1, Math.max(0, (nowLin - a) / (b - a)));
}

type TimelineLane = {
  session: MarketSession;
  glance: SessionGlance | undefined;
  isOpen: boolean;
  color: string;
  duration: number;
  mid: number;
  pct: number;
  blocks: { a: number; b: number }[];
  blockFracs: number[];
};

function LivePulseDot({ color, size = 6, pulsing = true }: { color: string; size?: number; pulsing?: boolean }) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.65);

  useEffect(() => {
    if (!pulsing) {
      scale.value = 1;
      opacity.value = 0;
      return;
    }
    scale.value = 1;
    opacity.value = 0.65;
    scale.value = withRepeat(
      withSequence(
        withTiming(1.9, { duration: 900, easing: Easing.out(Easing.ease) }),
        withTiming(1, { duration: 900, easing: Easing.in(Easing.ease) }),
      ),
      -1,
      false,
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 900, easing: Easing.out(Easing.ease) }),
        withTiming(0.65, { duration: 900, easing: Easing.in(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [pulsing, scale, opacity]);

  const haloStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {pulsing && (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: Radius.full,
              backgroundColor: color,
            },
            haloStyle,
          ]}
        />
      )}
      <View
        style={{
          width: size,
          height: size,
          borderRadius: Radius.full,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

function AnimatedElapsedBlock({ frac, color }: { frac: number; color: string }) {
  const animatedWidth = useSharedValue(0);

  useEffect(() => {
    animatedWidth.value = withTiming(Math.min(100, frac * 100), {
      duration: 650,
      easing: Easing.out(Easing.cubic),
    });
  }, [frac, animatedWidth]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: `${animatedWidth.value}%` as DimensionValue,
  }));

  return <Animated.View style={[styles.blockElapsed, { backgroundColor: color }, animatedStyle]} />;
}

function AnimatedProgressBar({ pct, color }: { pct: number; color: string }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(pct, {
      duration: 550,
      easing: Easing.out(Easing.cubic),
    });
  }, [pct, progress]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value}%` as DimensionValue,
  }));

  return (
    <View style={styles.popoverBarTrack}>
      <Animated.View style={[styles.popoverBarFill, { backgroundColor: color }, fillStyle]} />
    </View>
  );
}

function AnimatedNeedle({ leftPct }: { leftPct: number }) {
  const glow = useSharedValue(0.4);

  useEffect(() => {
    glow.value = withRepeat(
      withSequence(
        withTiming(0.95, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.4, { duration: 1100, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
  }, [glow]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glow.value,
  }));

  return (
    <View style={[styles.nowNeedle, { left: `${leftPct}%` as DimensionValue }]}>
      <Animated.View style={[styles.nowNeedleGlow, glowStyle]} />
    </View>
  );
}

function SessionPopover({
  lane,
  onClose,
}: {
  lane: TimelineLane;
  onClose: () => void;
}) {
  const theme = useTheme();
  const { session, glance, isOpen, color, pct } = lane;
  const statusColor = isOpen ? theme.positive : glance?.isOpeningSoon ? theme.warning : theme.textMuted;
  const statusTitle = isOpen ? 'Session Active' : glance?.isOpeningSoon ? 'Opening Soon' : 'Session Closed';
  const statusCountdown = glance?.countdown ?? (isOpen ? 'Live' : 'Closed');

  const cityTime = useMemo(() => {
    return formatZonedTime(new Date(), CITY_TIMEZONES[session.id]);
  }, [session.id]);

  return (
    <View style={styles.popover}>
      {/* Header */}
      <View style={styles.popoverHeader}>
        <View style={styles.popoverFlagWrap}>
          <ThemedText style={styles.popoverFlag}>{session.flag}</ThemedText>
        </View>
        <View style={styles.popoverTitleWrap}>
          <ThemedText type="smallBold" numberOfLines={1} style={styles.popoverCity}>
            {session.city} Session
          </ThemedText>
          <View style={styles.popoverMetaRow}>
            <ThemedText type="small" themeColor="textMuted" numberOfLines={1} style={styles.popoverCode}>
              {session.code} • {session.region}
            </ThemedText>
            <ThemedText type="small" themeColor="textMuted" style={styles.popoverMetaDot}>•</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.popoverLiveClock}>
              {cityTime.time} {cityTime.abbrev}
            </ThemedText>
          </View>
        </View>
        <Tap
          accessibilityRole="button"
          accessibilityLabel="Close session details"
          onPress={onClose}
          hitSlop={8}
          style={styles.popoverClose}>
          <AppIcon name="close" size={12} color={theme.textSecondary} />
        </Tap>
      </View>

      {/* Live Status Pill */}
      <View
        style={[
          styles.popoverStatusPill,
          {
            backgroundColor: isOpen
              ? 'rgba(43, 213, 118, 0.12)'
              : glance?.isOpeningSoon
                ? 'rgba(245, 185, 66, 0.12)'
                : 'rgba(255, 255, 255, 0.05)',
          },
        ]}>
        <View style={styles.popoverStatusLeft}>
          <LivePulseDot color={statusColor} size={6} pulsing={isOpen} />
          <ThemedText type="smallBold" numberOfLines={1} style={[styles.popoverStatus, { color: statusColor }]}>
            {statusTitle}
          </ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.popoverCountdown}>
          {statusCountdown}
        </ThemedText>
      </View>

      {/* Session Windows Info Card */}
      <View style={styles.popoverTimeCard}>
        <View style={styles.popoverTimeRow}>
          <AppIcon name="globe" size={12} color={color} />
          <ThemedText type="small" themeColor="textMuted" style={styles.popoverTimeLabel}>
            UTC Window
          </ThemedText>
          <ThemedText type="smallBold" style={styles.popoverHours}>
            {session.startUtcHour.toString().padStart(2, '0')}:00 – {session.endUtcHour.toString().padStart(2, '0')}:00 UTC
          </ThemedText>
        </View>
        {glance ? (
          <View style={styles.popoverTimeRow}>
            <AppIcon name="clock" size={12} color={theme.textMuted} />
            <ThemedText type="small" themeColor="textMuted" style={styles.popoverTimeLabel}>
              Exchange
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.popoverLocal}>
              {glance.localHours} local
            </ThemedText>
          </View>
        ) : null}
      </View>

      {/* Progress Bar (when open) */}
      {isOpen ? (
        <View style={styles.popoverBarContainer}>
          <View style={styles.popoverBarHeader}>
            <ThemedText type="small" themeColor="textMuted" style={styles.popoverProgressLabel}>
              Session Progress
            </ThemedText>
            <ThemedText type="smallBold" style={[styles.popoverProgressPct, { color }]}>
              {pct}%
            </ThemedText>
          </View>
          <AnimatedProgressBar pct={pct} color={color} />
        </View>
      ) : null}
    </View>
  );
}

function SessionTimeline({
  glances,
  onPress,
}: {
  glances: SessionGlance[];
  onPress?: () => void;
}) {
  const theme = useTheme();
  const [selectedId, setSelectedId] = useState<SessionId | null>(null);

  const model = useMemo(() => {
    const now = new Date();
    const hourFloat = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
    const glanceById = new Map(glances.map((g) => [g.session.id, g]));
    const lanes: TimelineLane[] = GLOBAL_SESSIONS.map((session) => {
      const glance = glanceById.get(session.id);
      const isOpen = glance?.isOpen ?? false;
      const duration = ((session.endUtcHour - session.startUtcHour + 24) % 24) || 24;
      const wraps = session.startUtcHour + duration > 24;
      const nowLin = wraps && hourFloat < session.startUtcHour ? hourFloat + 24 : hourFloat;
      // Split a midnight-wrapping window into drawable 0–24 blocks.
      const blocks = wraps
        ? [
            { a: session.startUtcHour, b: 24 },
            { a: 0, b: session.startUtcHour + duration - 24 },
          ]
        : [{ a: session.startUtcHour, b: session.startUtcHour + duration }];
      const blockFracs = blocks.map(({ a, b }) => (isOpen ? blockElapsedFraction(nowLin, a, b) : 0));
      const elapsedHours = blocks.reduce((sum, { a, b }, blockIndex) => sum + blockFracs[blockIndex] * (b - a), 0);
      return {
        session,
        glance,
        isOpen,
        color: sessionBarColor(theme, session.id),
        duration,
        mid: (session.startUtcHour + duration / 2) % 24,
        pct: Math.round((elapsedHours / duration) * 100),
        blocks,
        blockFracs,
      };
    });
    const openCities = lanes.filter((l) => l.isOpen).map((l) => l.session.city);

    const minutesLeftInUtcDay = Math.max(0, Math.round((24 - hourFloat) * 60));
    const timeLeftInDay = formatMinutesHuman(minutesLeftInUtcDay);

    let tradingDateLabel = '';
    try {
      tradingDateLabel = new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(now);
    } catch {
      tradingDateLabel = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    }

    return { lanes, openCities, hourFloat, timeLeftInDay, tradingDateLabel };
  }, [glances, theme]);

  const { lanes, hourFloat, timeLeftInDay, tradingDateLabel } = model;
  const nowPct = (hourFloat / 24) * 100;
  // const badgeClampedPct = Math.min(Math.max(nowPct, 8), 92);

  const selectedIndex = lanes.findIndex((l) => l.session.id === selectedId);
  const selectedLane = selectedIndex >= 0 ? lanes[selectedIndex] : null;

  return (
    <View style={styles.timelineWrap}>
      {/* 24-Hour Time Scale / Ruler */}
      <View style={styles.timelineRulerRow}>
        <View style={styles.laneLabelSpacer} />
        <View style={styles.timelineRulerTrack}>
          <ThemedText style={[styles.rulerText, { left: '0%' }]}>00h</ThemedText>
          <ThemedText style={[styles.rulerText, { left: '25%', transform: [{ translateX: -8 }] }]}>06h</ThemedText>
          <ThemedText style={[styles.rulerText, { left: '50%', transform: [{ translateX: -8 }] }]}>12h</ThemedText>
          <ThemedText style={[styles.rulerText, { left: '75%', transform: [{ translateX: -8 }] }]}>18h</ThemedText>
          <ThemedText style={[styles.rulerText, { right: 0 }]}>24h</ThemedText>

          {/* NOW Badge positioned over current hour */}
          {/* <View style={[styles.nowBadge, { left: `${badgeClampedPct}%` as DimensionValue }]}>
            <LivePulseDot color="#38BDF8" size={4} pulsing={true} />
            <ThemedText style={styles.nowBadgeText}>{}</ThemedText>
          </View> */}
        </View>
      </View>

      {/* Main Timeline Lanes Area */}
      <View style={styles.timelineMainContainer}>
        {/* Vertical Grid Guidelines + Needle Line */}
        <View style={styles.gridOverlay} pointerEvents="none">
          <View style={styles.laneLabelSpacer} />
          <View style={styles.gridTrackArea}>
            <View style={[styles.gridLine, { left: '0%' }]} />
            <View style={[styles.gridLine, { left: '25%' }]} />
            <View style={[styles.gridLine, { left: '50%' }]} />
            <View style={[styles.gridLine, { left: '75%' }]} />
            <View style={[styles.gridLine, { right: 0 }]} />

            {/* Current Real-Time Needle Line */}
            <AnimatedNeedle leftPct={nowPct} />
          </View>
        </View>

        {/* The 4 Session Lanes */}
        <View style={styles.lanesList}>
          {lanes.map((lane) => {
            const { session, isOpen, color } = lane;
            const selected = selectedId === session.id;
            return (
              <Tap
                key={session.id}
                accessibilityRole="button"
                accessibilityLabel={`${session.city} session, ${isOpen ? 'active now' : 'closed'}. Show details.`}
                onPress={() => setSelectedId((current) => (current === session.id ? null : session.id))}
                style={[
                  styles.laneRow,
                  selected && { backgroundColor: `${color}18`, borderColor: 'transparent' },
                ]}>
                {/* Left: City Identifier & Status */}
                <View style={styles.laneLabelWrap}>
                  <ThemedText style={styles.laneFlag}>{session.flag}</ThemedText>
                  <ThemedText
                    style={[
                      styles.laneCode,
                      { color: isOpen ? theme.text : theme.textMuted },
                      isOpen && styles.laneCodeActive,
                    ]}>
                    {session.code}
                  </ThemedText>
                  <LivePulseDot
                    color={isOpen ? color : 'rgba(255,255,255,0.18)'}
                    size={5}
                    pulsing={isOpen}
                  />
                </View>

                {/* Right: 24h Bar Track */}
                <View style={styles.laneTrackArea}>
                  <View
                    style={[
                      styles.laneTrackGutter,
                      selected && { backgroundColor: 'rgba(255,255,255,0.07)' },
                    ]}>
                    {lane.blocks.map(({ a, b }, blockIndex) => {
                      const frac = lane.blockFracs[blockIndex];
                      const left: DimensionValue = `${(a / 24) * 100}%`;
                      const width: DimensionValue = `${((b - a) / 24) * 100}%`;

                      if (isOpen) {
                        return (
                          <View
                            key={blockIndex}
                            style={[
                              styles.trackBlockOpen,
                              {
                                left,
                                width,
                                backgroundColor: `${color}2E`,
                                borderColor: `${color}60`,
                              },
                            ]}>
                            {frac > 0 && (
                              <AnimatedElapsedBlock frac={frac} color={color} />
                            )}
                          </View>
                        );
                      }

                      return (
                        <View
                          key={blockIndex}
                          style={[
                            styles.trackBlockClosed,
                            {
                              left,
                              width,
                              backgroundColor: `${color}12`,
                              borderColor: `${color}24`,
                            },
                          ]}
                        />
                      );
                    })}
                  </View>
                </View>
              </Tap>
            );
          })}
        </View>
      </View>

      {/* Floating Popover Overlay with Backdrop */}
      {selectedLane && (
        <Animated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(130)}
          style={styles.popoverOverlay}
          pointerEvents="box-none">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss session details"
            onPress={() => setSelectedId(null)}
            style={styles.popoverBackdrop}
          />
          <Animated.View
            entering={FadeIn.duration(180)}
            exiting={FadeOut.duration(120)}
            style={styles.popoverCardWrap}>
            <SessionPopover lane={selectedLane} onClose={() => setSelectedId(null)} />
          </Animated.View>
        </Animated.View>
      )}

      {/* Bottom Trading Day Row */}
      <View style={[styles.tradingDayRow, { borderTopColor: theme.border }]}>
        <View style={styles.tradingDayLeft}>
          <ThemedText style={styles.tradingDaySun}>☀️</ThemedText>
          <ThemedText type="smallBold" style={styles.tradingDayDate}>
            {tradingDateLabel}
          </ThemedText>
        </View>

        <View style={styles.tradingDayRight}>
          <ThemedText type="small" themeColor="textMuted" style={styles.tradingDayTimeLeft}>
            {timeLeftInDay} left
          </ThemedText>
          <View style={[styles.tradingDayDivider, { backgroundColor: theme.borderStrong }]} />
          <Tap
            accessibilityRole="button"
            accessibilityLabel="Open all session windows"
            onPress={onPress}
            style={styles.tradingDayAction}>
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.timelineMoreText}>
              Details
            </ThemedText>
            <AppIcon name="chevron" size={14} color={theme.textSecondary} />
          </Tap>
        </View>
      </View>
    </View>
  );
}

export function SessionVariantSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [selectedVariantId, setSelectedVariantId] = useState<VariantId>('london-ny-overlap');
  const [clockTick, setClockTick] = useState(() => Date.now());

  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(() => setClockTick(Date.now()), 30000);
    return () => clearInterval(timer);
  }, [visible]);

  const selectedVariant = useMemo(() => {
    return SESSION_VARIANTS.find((v) => v.id === selectedVariantId) ?? SESSION_VARIANTS[0];
  }, [selectedVariantId]);

  const liveState = useMemo(() => {
    void clockTick;
    void visible;
    return computeSessionState(new Date());
  }, [clockTick, visible]);

  const glanceById = useMemo(
    () => new Map(liveState.sessionGlances.map((g) => [g.session.id, g])),
    [liveState],
  );

  const activeHubs = useMemo(() => {
    return selectedVariant.activeSessionIds
      .map((id) => GLOBAL_SESSIONS.find((s) => s.id === id))
      .filter((s): s is MarketSession => Boolean(s));
  }, [selectedVariant]);

  const variantAccent = getSessionColor(theme, selectedVariant.iconTone);
  const typeLabel = selectedVariant.isWeekendOnly
    ? 'WEEKEND 24/7'
    : selectedVariant.isOverlap
      ? 'OVERLAP WINDOW'
      : 'SINGLE SESSION';
  const isSelectedLive = liveState.activeVariant.id === selectedVariant.id;

  return (
    <BottomSheet visible={visible} title="Market Session Windows" onClose={onClose}>
      <View style={styles.sheetContainer}>
        <ScrollView showsVerticalScrollIndicator={false} style={styles.sheetScroll} contentContainerStyle={styles.sheetContent}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.sheetIntro}>
            Reference for the 4 major FX session centers and their standard UTC windows. Open and closed states update live from your device clock.
          </ThemedText>

          {/* Variant Horizontal Selector Tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.variantChips}>
            {SESSION_VARIANTS.map((variant) => {
              const isSelected = variant.id === selectedVariantId;
              const chipAccent = getSessionColor(theme, variant.iconTone);

              return (
                <Tap
                  key={variant.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => setSelectedVariantId(variant.id)}
                  style={[
                    styles.variantChip,
                    {
                      borderColor: isSelected ? chipAccent : theme.border,
                      backgroundColor: isSelected ? `${chipAccent}1F` : theme.surfaceVariant,
                    },
                  ]}>
                  <ThemedText
                    type="smallBold"
                    style={{
                      color: isSelected ? chipAccent : theme.textSecondary,
                      fontSize: 12,
                    }}>
                    {variant.shortLabel}
                  </ThemedText>
                </Tap>
              );
            })}
          </ScrollView>

          {/* Selected Variant Detail Card */}
          <View style={[styles.detailCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {/* Header */}
            <View style={styles.detailHeader}>
              <View style={[styles.variantBadge, { backgroundColor: `${variantAccent}1F`, borderColor: `${variantAccent}50` }]}>
                <ThemedText style={[styles.variantBadgeText, { color: variantAccent }]}>
                  {typeLabel}
                </ThemedText>
              </View>
              <ThemedText style={styles.detailTitle}>{selectedVariant.title}</ThemedText>
            </View>

            {/* Schedule Info */}
            <View style={[styles.detailSection, { borderTopColor: theme.border }]}>
              <View style={styles.sectionRow}>
                <AppIcon name="clock" size={15} color={theme.textSecondary} />
                <ThemedText type="smallBold" themeColor="textSecondary">TIMING & WINDOW</ThemedText>
              </View>
              <View style={styles.timingPillRow}>
                <View style={[styles.timingPill, { backgroundColor: theme.surface }]}>
                  <ThemedText type="small" themeColor="textMuted">UTC Hours</ThemedText>
                  <ThemedText type="smallBold" style={styles.timingValue}>{selectedVariant.utcTimeRange}</ThemedText>
                </View>
                <View style={[styles.timingPill, { backgroundColor: theme.surface }]}>
                  <ThemedText type="small" themeColor="textMuted">Active Hubs</ThemedText>
                  <ThemedText type="smallBold" style={styles.timingValue}>
                    {activeHubs.length > 0 ? activeHubs.map((h) => `${h.flag} ${h.city}`).join(' + ') : '🌐 Global 24/7'}
                  </ThemedText>
                </View>
              </View>
            </View>

            {/* Live Status — derived from the device clock */}
            <View style={[styles.detailSection, { borderTopColor: theme.border }]}>
              <View style={styles.sectionRow}>
                <View style={[styles.statusDotSmall, { backgroundColor: isSelectedLive ? theme.positive : theme.textMuted }]} />
                <ThemedText type="smallBold" themeColor="textSecondary">
                  {isSelectedLive ? 'OPEN NOW' : 'CLOSED NOW'}
                </ThemedText>
              </View>
              {activeHubs.length > 0 ? (
                <View style={styles.hubStatusList}>
                  {activeHubs.map((hub) => {
                    const glance = glanceById.get(hub.id);
                    const open = glance?.isOpen ?? false;
                    return (
                      <View key={hub.id} style={styles.hubStatusRow}>
                        <ThemedText type="small" style={styles.hubStatusFlag}>{hub.flag}</ThemedText>
                        <ThemedText type="smallBold" style={styles.hubStatusCity}>{hub.city}</ThemedText>
                        <View style={[styles.statusDotSmall, { backgroundColor: open ? theme.positive : theme.textMuted }]} />
                        <ThemedText type="small" themeColor="textMuted" style={styles.hubStatusText}>
                          {glance ? `${glance.statusText} • ${glance.countdown}` : hub.code}
                        </ThemedText>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <ThemedText type="small" themeColor="textSecondary">
                  {liveState.isWeekend
                    ? 'Weekend — traditional FX sessions are closed.'
                    : 'Weekend-only window — traditional FX sessions are currently in their weekday schedule.'}
                </ThemedText>
              )}
            </View>

            {/* All session hours — factual reference */}
            <View style={[styles.detailSection, { borderTopColor: theme.border }]}>
              <View style={styles.sectionRow}>
                <AppIcon name="clock" size={15} color={theme.textSecondary} />
                <ThemedText type="smallBold" themeColor="textSecondary">ALL SESSION HOURS (UTC)</ThemedText>
              </View>
              <View style={styles.hubStatusList}>
                {GLOBAL_SESSIONS.map((session) => {
                  const glance = glanceById.get(session.id);
                  const open = glance?.isOpen ?? false;
                  return (
                    <View key={session.id} style={styles.hubStatusRow}>
                      <ThemedText type="small" style={styles.hubStatusFlag}>{session.flag}</ThemedText>
                      <ThemedText type="smallBold" style={styles.hubStatusCity}>{session.city}</ThemedText>
                      <ThemedText type="small" themeColor="textMuted" style={styles.hubStatusHours}>
                        {session.startUtcHour.toString().padStart(2, '0')}:00–{session.endUtcHour.toString().padStart(2, '0')}:00
                      </ThemedText>
                      <View style={[styles.statusDotSmall, { backgroundColor: open ? theme.positive : theme.textMuted }]} />
                      <ThemedText type="small" themeColor="textMuted" style={styles.hubStatusText}>
                        {open ? 'Open' : 'Closed'}
                      </ThemedText>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        </ScrollView>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.lg,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  topMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionHeaderText: {
    fontSize: 13,
    lineHeight: 16,
    letterSpacing: -0.2,
  },

  clockContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
  },
  clockText: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  clockSheetList: {
    gap: 0,
    paddingBottom: Spacing.two,
  },
  clockSheetNote: {
    fontSize: 11,
    marginBottom: Spacing.two,
  },
  clockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  clockRowLast: {
    borderBottomWidth: 0,
  },
  clockLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    flex: 1,
    minWidth: 0,
  },
  clockFlag: {
    fontSize: 20,
  },
  clockCityWrap: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  clockCityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  clockCity: {
    fontSize: 13,
    lineHeight: 17,
  },
  clockSub: {
    fontSize: 11,
    lineHeight: 14,
  },
  clockRight: {
    alignItems: 'flex-end',
    gap: 1,
  },
  clockTime: {
    fontSize: 17,
    lineHeight: 21,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  clockAbbrev: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  titleSection: {
    gap: 3,
  },
  variantTitle: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  timeRangeText: {
    fontSize: 12,
    lineHeight: 16,
  },
  statusCountdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    marginTop: Spacing.half,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusDotSmall: {
    width: 6,
    height: 6,
    borderRadius: Radius.full,
  },
  countdownInline: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
  },
  countdownLabel: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  countdownSub: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: Radius.full,
  },
  timelineWrap: {
    gap: Spacing.two,
    marginTop: Spacing.one,
    position: 'relative',
  },
  timelineRulerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 18,
  },
  laneLabelSpacer: {
    width: 60,
  },
  timelineRulerTrack: {
    flex: 1,
    height: 18,
    position: 'relative',
    justifyContent: 'center',
  },
  rulerText: {
    position: 'absolute',
    top: 2,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '600',
    color: '#777673',
    fontVariant: ['tabular-nums'],
  },
  nowBadge: {
    position: 'absolute',
    top: 0,
    transform: [{ translateX: -18 }],
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#262832',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
    borderRadius: Radius.full,
    paddingHorizontal: 5,
    paddingVertical: 1,
    zIndex: 10,
  },
  nowBadgeDot: {
    width: 4,
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: '#38BDF8',
  },
  nowBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: '#F5F5F4',
  },
  timelineMainContainer: {
    position: 'relative',
    borderRadius: Radius.md,
    overflow: 'visible',
  },
  gridOverlay: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
    zIndex: 1,
  },
  gridTrackArea: {
    flex: 1,
    position: 'relative',
  },
  gridLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  nowNeedle: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 0.5,
    marginLeft: -0.75,
    backgroundColor: '#ff9524a9',
    borderRadius: 1,
    opacity: 0.9,
    zIndex: 5,
  },
  nowNeedleGlow: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#FFFFFF',
    shadowColor: '#38BDF8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 3,
  },
  lanesList: {
    gap: 6,
    zIndex: 2,
  },
  laneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 24,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    paddingHorizontal: 2,
  },
  laneLabelWrap: {
    width: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  laneFlag: {
    fontSize: 13,
  },
  laneCode: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  laneCodeActive: {
    fontWeight: '800',
  },
  laneStatusDot: {
    width: 5,
    height: 5,
    borderRadius: Radius.full,
  },
  laneTrackArea: {
    flex: 1,
    justifyContent: 'center',
  },
  laneTrackGutter: {
    height: 12,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.06)',
    position: 'relative',
    overflow: 'hidden',
  },
  trackBlockOpen: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  trackBlockClosed: {
    position: 'absolute',
    top: 1,
    bottom: 1,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  blockElapsed: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: Radius.full,
  },
  popoverOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 1000,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: Radius.md,
  },
  popoverBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.70)',
    borderRadius: Radius.md,
  },
  popoverCardWrap: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1001,
  },
  popover: {
    width: '94%',
    maxWidth: 304,
    backgroundColor: '#0F1014',
    borderRadius: Radius.lg,
    padding: Spacing.four,
    gap: Spacing.two + 3,
    zIndex: 1001,
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.85,
    shadowRadius: 24,
  },
  popoverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
  },
  popoverFlagWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: '#181920',
    alignItems: 'center',
    justifyContent: 'center',
  },
  popoverFlag: {
    fontSize: 20,
  },
  popoverTitleWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  popoverCity: {
    fontSize: 14,
    lineHeight: 18,
  },
  popoverMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  popoverCode: {
    fontSize: 10,
    lineHeight: 13,
  },
  popoverMetaDot: {
    fontSize: 10,
    lineHeight: 13,
  },
  popoverLiveClock: {
    fontSize: 10,
    lineHeight: 13,
    fontVariant: ['tabular-nums'],
  },
  popoverClose: {
    width: 26,
    height: 26,
    borderRadius: Radius.full,
    backgroundColor: '#1C1D24',
    alignItems: 'center',
    justifyContent: 'center',
  },
  popoverStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
    borderRadius: Radius.sm,
  },
  popoverStatusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  popoverStatus: {
    fontSize: 11,
    lineHeight: 14,
  },
  popoverCountdown: {
    fontSize: 11,
    lineHeight: 14,
    fontVariant: ['tabular-nums'],
  },
  popoverTimeCard: {
    backgroundColor: '#16171E',
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: 7,
    gap: 5,
  },
  popoverTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  popoverTimeLabel: {
    fontSize: 10,
    lineHeight: 14,
    minWidth: 64,
  },
  popoverHours: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  popoverLocal: {
    flex: 1,
    fontSize: 10,
    lineHeight: 14,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  popoverBarContainer: {
    gap: 4,
    marginTop: 1,
  },
  popoverBarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  popoverProgressLabel: {
    fontSize: 10,
  },
  popoverProgressPct: {
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
  popoverBarTrack: {
    height: 4,
    backgroundColor: '#20222A',
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  popoverBarFill: {
    height: '100%',
    borderRadius: Radius.full,
  },
  tradingDayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    marginTop: Spacing.two,
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tradingDayLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  tradingDaySun: {
    fontSize: 14,
    lineHeight: 18,
  },
  tradingDayDate: {
    fontSize: 12,
    lineHeight: 16,
  },
  tradingDayRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  tradingDayTimeLeft: {
    fontSize: 12,
    lineHeight: 16,
    fontVariant: ['tabular-nums'],
  },
  tradingDayDivider: {
    width: 1,
    height: 12,
    marginHorizontal: 2,
  },
  tradingDayAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  timelineMoreText: {
    fontSize: 11,
  },
  // Bottom Sheet Styles
  sheetContainer: {
    flexGrow: 0,
    flexShrink: 1,
    minHeight: 0,
  },
  sheetContent: {
    gap: Spacing.four,
    paddingBottom: Spacing.four,
  },
  // Shrink-only scroll views: size to content, shrink under the sheet's
  // maxHeight and scroll instead of clipping (flex:1 mismeasures here).
  sheetScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  sheetIntro: {
    lineHeight: 18,
  },
  variantChips: {
    gap: Spacing.two,
    paddingVertical: Spacing.half,
  },
  variantChip: {
    paddingHorizontal: Spacing.three,
    minHeight: 32,
    justifyContent: 'center',
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  detailCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radius.lg,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  detailHeader: {
    gap: 4,
  },
  variantBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
  variantBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  detailTitle: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  detailSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.three,
    gap: Spacing.two,
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  timingPillRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  timingPill: {
    flex: 1,
    padding: Spacing.two,
    borderRadius: Radius.sm,
    gap: 2,
  },
  timingValue: {
    fontSize: 12,
    lineHeight: 16,
  },
  hubStatusList: {
    gap: Spacing.two,
  },
  hubStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  hubStatusFlag: {
    fontSize: 16,
  },
  hubStatusCity: {
    fontSize: 12,
    minWidth: 64,
  },
  hubStatusHours: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  hubStatusText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 14,
  },
});
