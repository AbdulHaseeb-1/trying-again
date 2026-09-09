import type { FetchWindow, SourceName, SourceResult } from '../calendar.types';

/**
 * A calendar source turns a date window into normalized events.
 * The service tries sources in priority order and keeps the first that answers.
 */
export interface CalendarSource {
  readonly name: SourceName;
  /** Lower runs first. */
  readonly priority: number;
  fetch(window: FetchWindow): Promise<SourceResult>;
}

export const CALENDAR_SOURCES = Symbol('CALENDAR_SOURCES');
export type { FetchWindow, SourceResult };
