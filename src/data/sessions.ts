import type { Tone } from './market';

export type SessionId = 'sydney' | 'tokyo' | 'london' | 'newyork';

export type MarketSession = {
  id: SessionId;
  name: string;
  code: string;
  flag: string;
  city: string;
  region: string;
  startUtcHour: number; // 0-24
  endUtcHour: number; // 0-24
};

export const GLOBAL_SESSIONS: MarketSession[] = [
  {
    id: 'sydney',
    name: 'Sydney Session',
    code: 'SYD',
    flag: '🇦🇺',
    city: 'Sydney',
    region: 'Oceania / Pacific',
    startUtcHour: 21,
    endUtcHour: 6,
  },
  {
    id: 'tokyo',
    name: 'Tokyo Session',
    code: 'TYO',
    flag: '🇯🇵',
    city: 'Tokyo',
    region: 'Asia',
    startUtcHour: 0,
    endUtcHour: 9,
  },
  {
    id: 'london',
    name: 'London Session',
    code: 'LDN',
    flag: '🇬🇧',
    city: 'London',
    region: 'Europe',
    startUtcHour: 7,
    endUtcHour: 16,
  },
  {
    id: 'newyork',
    name: 'New York Session',
    code: 'NYC',
    flag: '🇺🇸',
    city: 'New York',
    region: 'Americas',
    startUtcHour: 12,
    endUtcHour: 21,
  },
];

export type VariantId =
  | 'london-ny-overlap'
  | 'tokyo-london-overlap'
  | 'sydney-tokyo-overlap'
  | 'london-core'
  | 'ny-core'
  | 'tokyo-core'
  | 'sydney-core'
  | 'weekend-crypto';

export type SessionTone = Tone | 'primary' | 'secondary';

export type SessionVariant = {
  id: VariantId;
  title: string;
  shortLabel: string;
  iconTone: SessionTone;
  activeSessionIds: SessionId[];
  isOverlap: boolean;
  isWeekendOnly?: boolean;
  utcTimeRange: string;
  startUtcHour: number;
  endUtcHour: number;
};

export const SESSION_VARIANTS: SessionVariant[] = [
  {
    id: 'london-ny-overlap',
    title: 'London × New York Overlap',
    shortLabel: 'London × NY',
    iconTone: 'positive',
    activeSessionIds: ['london', 'newyork'],
    isOverlap: true,
    utcTimeRange: '12:00 – 16:00 UTC',
    startUtcHour: 12,
    endUtcHour: 16,
  },
  {
    id: 'tokyo-london-overlap',
    title: 'Tokyo × London Overlap',
    shortLabel: 'Tokyo × London',
    iconTone: 'warning',
    activeSessionIds: ['tokyo', 'london'],
    isOverlap: true,
    utcTimeRange: '07:00 – 09:00 UTC',
    startUtcHour: 7,
    endUtcHour: 9,
  },
  {
    id: 'sydney-tokyo-overlap',
    title: 'Sydney × Tokyo Overlap',
    shortLabel: 'Sydney × Tokyo',
    iconTone: 'secondary',
    activeSessionIds: ['sydney', 'tokyo'],
    isOverlap: true,
    utcTimeRange: '00:00 – 06:00 UTC',
    startUtcHour: 0,
    endUtcHour: 6,
  },
  {
    id: 'london-core',
    title: 'London Core Session',
    shortLabel: 'London Solo',
    iconTone: 'positive',
    activeSessionIds: ['london'],
    isOverlap: false,
    utcTimeRange: '09:00 – 12:00 UTC',
    startUtcHour: 9,
    endUtcHour: 12,
  },
  {
    id: 'ny-core',
    title: 'New York Afternoon & Power Hour',
    shortLabel: 'New York Solo',
    iconTone: 'primary',
    activeSessionIds: ['newyork'],
    isOverlap: false,
    utcTimeRange: '16:00 – 21:00 UTC',
    startUtcHour: 16,
    endUtcHour: 21,
  },
  {
    id: 'tokyo-core',
    title: 'Tokyo Asian Core',
    shortLabel: 'Tokyo Solo',
    iconTone: 'secondary',
    activeSessionIds: ['tokyo'],
    isOverlap: false,
    utcTimeRange: '06:00 – 07:00 UTC',
    startUtcHour: 6,
    endUtcHour: 7,
  },
  {
    id: 'sydney-core',
    title: 'Sydney Pacific Open',
    shortLabel: 'Sydney Solo',
    iconTone: 'neutral',
    activeSessionIds: ['sydney'],
    isOverlap: false,
    utcTimeRange: '21:00 – 00:00 UTC',
    startUtcHour: 21,
    endUtcHour: 24,
  },
  {
    id: 'weekend-crypto',
    title: 'Weekend 24/7 Crypto Window',
    shortLabel: 'Weekend Crypto',
    iconTone: 'warning',
    activeSessionIds: [],
    isOverlap: false,
    isWeekendOnly: true,
    utcTimeRange: 'Saturday – Sunday (24/7)',
    startUtcHour: 0,
    endUtcHour: 24,
  },
];

export type SessionGlance = {
  session: MarketSession;
  isOpen: boolean;
  statusText: string;
  countdown: string;
  isOpeningSoon: boolean;
  localHours: string;
  utcHours: string;
  progressPercent: number; // 0 to 100 — how much of this exchange window is completed
};

export type CurrentSessionState = {
  isWeekend: boolean;
  activeVariant: SessionVariant;
  activeSessions: MarketSession[];
  upcomingSession: MarketSession;
  minutesUntilUpcoming: number;
  minutesRemainingInVariant: number;
  progressPercent: number; // 0 to 100
  timeStringUtc: string;
  timeStringLocal: string;
  dateLabel: string;
  sessionGlances: SessionGlance[];
};

/** Helper to check if a 24-hour hour float is inside a start/end window */
function isHourInWindow(hourFloat: number, start: number, end: number): boolean {
  if (start < end) {
    return hourFloat >= start && hourFloat < end;
  }
  // Crosses midnight (e.g. 21 to 6)
  return hourFloat >= start || hourFloat < end;
}

/** Compute duration in minutes of a session window */
function getWindowDurationMinutes(start: number, end: number): number {
  if (start < end) {
    return (end - start) * 60;
  }
  return (24 - start + end) * 60;
}

/** Compute elapsed minutes since start */
function getElapsedMinutes(hourFloat: number, start: number, end: number): number {
  if (start < end) {
    return Math.max(0, (hourFloat - start) * 60);
  }
  if (hourFloat >= start) {
    return (hourFloat - start) * 60;
  }
  return (24 - start + hourFloat) * 60;
}

/** Minutes until session opens */
function getMinutesUntilOpen(hourFloat: number, start: number): number {
  if (start >= hourFloat) {
    return Math.round((start - hourFloat) * 60);
  }
  return Math.round((24 - hourFloat + start) * 60);
}

/** Format minutes into human-friendly string: e.g. "2h 35m" or "45m" */
export function formatMinutesHuman(totalMinutes: number): string {
  const mins = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m.toString().padStart(2, '0')}m`;
}

/** Format local time of a UTC hour on a given date */
function formatUtcHourToLocal(utcHour: number): string {
  const d = new Date();
  d.setUTCHours(utcHour, 0, 0, 0);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * Computes the complete market session status for any given date/time,
 * derived live from the device clock and the fixed UTC session windows.
 */
export function computeSessionState(date: Date = new Date()): CurrentSessionState {
  const dayOfWeek = date.getUTCDay(); // 0 = Sunday, 6 = Saturday
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  const utcHour = date.getUTCHours();
  const utcMinute = date.getUTCMinutes();
  const hourFloat = utcHour + utcMinute / 60;

  // Determine active individual sessions
  const activeSessions = GLOBAL_SESSIONS.filter((s) => isHourInWindow(hourFloat, s.startUtcHour, s.endUtcHour));

  // Determine active variant from the real clock only.
  let activeVariant: SessionVariant;

  if (isWeekend) {
    activeVariant = SESSION_VARIANTS.find((v) => v.id === 'weekend-crypto')!;
  } else if (isHourInWindow(hourFloat, 12, 16)) {
    activeVariant = SESSION_VARIANTS.find((v) => v.id === 'london-ny-overlap')!;
  } else if (isHourInWindow(hourFloat, 7, 9)) {
    activeVariant = SESSION_VARIANTS.find((v) => v.id === 'tokyo-london-overlap')!;
  } else if (isHourInWindow(hourFloat, 0, 6)) {
    activeVariant = SESSION_VARIANTS.find((v) => v.id === 'sydney-tokyo-overlap')!;
  } else if (isHourInWindow(hourFloat, 9, 12)) {
    activeVariant = SESSION_VARIANTS.find((v) => v.id === 'london-core')!;
  } else if (isHourInWindow(hourFloat, 16, 21)) {
    activeVariant = SESSION_VARIANTS.find((v) => v.id === 'ny-core')!;
  } else if (isHourInWindow(hourFloat, 6, 7)) {
    activeVariant = SESSION_VARIANTS.find((v) => v.id === 'tokyo-core')!;
  } else {
    activeVariant = SESSION_VARIANTS.find((v) => v.id === 'sydney-core')!;
  }

  // Calculate window progress and remaining time
  const totalWindowMinutes = getWindowDurationMinutes(activeVariant.startUtcHour, activeVariant.endUtcHour);
  const elapsedMinutes = getElapsedMinutes(hourFloat, activeVariant.startUtcHour, activeVariant.endUtcHour);
  const minutesRemainingInVariant = Math.max(1, Math.round(totalWindowMinutes - elapsedMinutes));
  const progressPercent = Math.min(100, Math.max(0, Math.round((elapsedMinutes / totalWindowMinutes) * 100)));

  // Calculate upcoming session
  const closedSessions = GLOBAL_SESSIONS.filter((s) => !isHourInWindow(hourFloat, s.startUtcHour, s.endUtcHour));
  let upcomingSession = closedSessions[0] ?? GLOBAL_SESSIONS[0];
  let minWait = 9999;
  for (const s of closedSessions) {
    const wait = getMinutesUntilOpen(hourFloat, s.startUtcHour);
    if (wait < minWait) {
      minWait = wait;
      upcomingSession = s;
    }
  }

  // Session Glances for all 4 major markets
  const sessionGlances: SessionGlance[] = GLOBAL_SESSIONS.map((session) => {
    const isOpen = isHourInWindow(hourFloat, session.startUtcHour, session.endUtcHour);
    const minsUntilOpen = getMinutesUntilOpen(hourFloat, session.startUtcHour);
    const isOpeningSoon = !isOpen && minsUntilOpen <= 120;

    const windowMinutes = getWindowDurationMinutes(session.startUtcHour, session.endUtcHour);
    const elapsedMinutes = isOpen
      ? getElapsedMinutes(hourFloat, session.startUtcHour, session.endUtcHour)
      : 0;
    const progressPercent = isOpen
      ? Math.min(100, Math.max(0, Math.round((elapsedMinutes / windowMinutes) * 100)))
      : 0;

    let countdown = '';
    let statusText = '';

    if (isOpen) {
      const remainingMins = Math.max(1, Math.round(getWindowDurationMinutes(session.startUtcHour, session.endUtcHour) - getElapsedMinutes(hourFloat, session.startUtcHour, session.endUtcHour)));
      countdown = `Closes in ${formatMinutesHuman(remainingMins)}`;
      statusText = 'Active Now';
    } else if (isOpeningSoon) {
      countdown = `Opens in ${formatMinutesHuman(minsUntilOpen)}`;
      statusText = 'Opens Soon';
    } else {
      countdown = `Opens in ${formatMinutesHuman(minsUntilOpen)}`;
      statusText = 'Closed';
    }

    const localStart = formatUtcHourToLocal(session.startUtcHour);
    const localEnd = formatUtcHourToLocal(session.endUtcHour);
    const localHours = `${localStart} – ${localEnd}`;
    const utcHours = `${session.startUtcHour.toString().padStart(2, '0')}:00 – ${session.endUtcHour.toString().padStart(2, '0')}:00 UTC`;

    return {
      session,
      isOpen,
      statusText,
      countdown,
      isOpeningSoon,
      localHours,
      utcHours,
      progressPercent,
    };
  });

  const timeStringUtc = `${utcHour.toString().padStart(2, '0')}:${utcMinute.toString().padStart(2, '0')} UTC`;
  const timeStringLocal = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const dateLabel = date.toLocaleDateString([], { month: 'short', day: 'numeric', weekday: 'short' });

  return {
    isWeekend,
    activeVariant,
    activeSessions,
    upcomingSession,
    minutesUntilUpcoming: minWait,
    minutesRemainingInVariant,
    progressPercent,
    timeStringUtc,
    timeStringLocal,
    dateLabel,
    sessionGlances,
  };
}
