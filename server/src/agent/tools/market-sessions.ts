/**
 * The four FX sessions, and which of them are open right now.
 *
 * A compact server-side table mirroring the hours the app's session view uses.
 * It lives here rather than being imported from the client because the client's
 * module is UI-shaped (labels, tones, copy) and the two projects do not share a
 * compilation unit; what an agent needs is the hours and the overlaps.
 */

export type SessionId = 'sydney' | 'tokyo' | 'london' | 'newyork';

export type SessionWindow = {
  id: SessionId;
  name: string;
  city: string;
  /** UTC hour the session opens. */
  startUtcHour: number;
  /** UTC hour it closes; less than `start` when it wraps midnight. */
  endUtcHour: number;
};

export const SESSIONS: SessionWindow[] = [
  { id: 'sydney', name: 'Sydney', city: 'Sydney', startUtcHour: 21, endUtcHour: 6 },
  { id: 'tokyo', name: 'Tokyo', city: 'Tokyo', startUtcHour: 0, endUtcHour: 9 },
  { id: 'london', name: 'London', city: 'London', startUtcHour: 7, endUtcHour: 16 },
  { id: 'newyork', name: 'New York', city: 'New York', startUtcHour: 12, endUtcHour: 21 },
];

export function isSessionOpen(session: SessionWindow, at: Date): boolean {
  const hour = at.getUTCHours() + at.getUTCMinutes() / 60;
  return session.startUtcHour <= session.endUtcHour
    ? hour >= session.startUtcHour && hour < session.endUtcHour
    : hour >= session.startUtcHour || hour < session.endUtcHour;
}

/** Hours until a session next opens, or 0 when it is already open. */
function hoursUntilOpen(session: SessionWindow, at: Date): number {
  if (isSessionOpen(session, at)) return 0;
  const hour = at.getUTCHours() + at.getUTCMinutes() / 60;
  const delta = session.startUtcHour - hour;
  return Number(((delta + 24) % 24).toFixed(2));
}

export type SessionState = {
  at: string;
  weekend: boolean;
  open: { id: SessionId; name: string; closesInHours: number }[];
  next: { id: SessionId; name: string; opensInHours: number } | null;
  /** Two sessions open at once — where the volume is. */
  overlap: string | null;
};

export function sessionState(at = new Date()): SessionState {
  const day = at.getUTCDay();
  const open = SESSIONS.filter((session) => isSessionOpen(session, at)).map((session) => {
    const hour = at.getUTCHours() + at.getUTCMinutes() / 60;
    const closesIn =
      session.startUtcHour <= session.endUtcHour
        ? session.endUtcHour - hour
        : (session.endUtcHour - hour + 24) % 24;
    return { id: session.id, name: session.name, closesInHours: Number(closesIn.toFixed(2)) };
  });

  const upcoming = SESSIONS.filter((session) => !isSessionOpen(session, at))
    .map((session) => ({
      id: session.id,
      name: session.name,
      opensInHours: hoursUntilOpen(session, at),
    }))
    .sort((a, b) => a.opensInHours - b.opensInHours);

  return {
    at: at.toISOString(),
    // FX is closed from Friday 21:00 UTC to Sunday 21:00 UTC; crypto is not.
    weekend: day === 6 || (day === 0 && at.getUTCHours() < 21) || (day === 5 && at.getUTCHours() >= 21),
    open,
    next: upcoming[0] ?? null,
    overlap: open.length > 1 ? open.map((session) => session.name).join(' / ') : null,
  };
}
