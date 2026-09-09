import { Body, Controller, Get, Inject, Post, Query, Sse } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { fromEvent, map, merge, startWith, type Observable } from 'rxjs';

import { calendarConfig } from '../config/configuration';
import { CalendarScheduler } from './calendar.scheduler';
import { CALENDAR_RELEASED, CALENDAR_SYNCED, CalendarService } from './calendar.service';
import { CalendarQueryDto } from './dto/calendar-query.dto';
import { RefreshConfigDto } from './dto/refresh-config.dto';
import type { CalendarEvent } from './calendar.types';

type CalendarDay = { date: string; events: CalendarEvent[] };

@ApiTags('calendar')
@Controller('api/calendar')
export class CalendarController {
  constructor(
    private readonly calendar: CalendarService,
    private readonly scheduler: CalendarScheduler,
    private readonly events: EventEmitter2,
    @Inject(calendarConfig.KEY)
    private readonly config: ConfigType<typeof calendarConfig>,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Economic calendar for the rolling window, grouped by UTC day.',
  })
  @ApiOkResponse({ description: 'Events plus the window and freshness metadata.' })
  list(@Query() query: CalendarQueryDto) {
    const events = this.calendar.query(query);
    const window = this.calendar.window();
    return {
      window: { from: window.from.toISOString(), to: window.to.toISOString() },
      generatedAt: new Date().toISOString(),
      lastSync: this.calendar.lastSync,
      lastChangedAt: this.calendar.changedAt,
      snapshotCapturedAt: this.calendar.snapshotCapturedAt,
      refreshIntervalMs: this.scheduler.refreshIntervalMs,
      nextRelease: this.calendar.nextRelease(),
      count: events.length,
      days: this.groupByDay(events),
      events,
    };
  }

  @Get('next')
  @ApiOperation({ summary: 'The next event that has not printed yet.' })
  next(@Query() query: CalendarQueryDto) {
    return { nextRelease: this.calendar.nextRelease(query.minImpact) };
  }

  @Get('status')
  @ApiOperation({ summary: 'Pipeline health: sources, sync history and armed release watches.' })
  status() {
    return {
      now: new Date().toISOString(),
      events: this.calendar.count,
      sources: this.calendar.sourceNames,
      snapshotCapturedAt: this.calendar.snapshotCapturedAt,
      refreshIntervalMs: this.scheduler.refreshIntervalMs,
      watch: {
        ...this.config.watch,
        active: this.scheduler.watchStates,
      },
      lastSync: this.calendar.lastSync,
      recentSyncs: this.calendar.recentSyncs,
    };
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Force a scrape now, bypassing the interval.' })
  refresh() {
    return this.calendar.sync('manual');
  }

  @Post('config')
  @ApiOperation({ summary: 'Retune the refresh loop at runtime.' })
  configure(@Body() body: RefreshConfigDto) {
    if (body.refreshIntervalMs) this.scheduler.setRefreshInterval(body.refreshIntervalMs);
    if (body.watchPollIntervalMs) this.config.watch.pollIntervalMs = body.watchPollIntervalMs;
    return {
      refreshIntervalMs: this.scheduler.refreshIntervalMs,
      watchPollIntervalMs: this.config.watch.pollIntervalMs,
    };
  }

  /**
   * Server-sent events so clients learn about a print the moment the burst
   * poller captures it, instead of waiting for their own next poll.
   */
  @Sse('stream')
  @ApiOperation({ summary: 'Live stream of sync and release notifications.' })
  stream(): Observable<{ type: string; data: string }> {
    const synced = fromEvent(this.events, CALENDAR_SYNCED).pipe(
      map((payload) => ({ type: 'sync', data: JSON.stringify(payload) })),
    );
    const released = fromEvent(this.events, CALENDAR_RELEASED).pipe(
      map((payload) => ({ type: 'release', data: JSON.stringify(payload) })),
    );
    return merge(synced, released).pipe(
      startWith({ type: 'ready', data: JSON.stringify({ at: new Date().toISOString() }) }),
    );
  }

  private groupByDay(events: CalendarEvent[]): CalendarDay[] {
    const days = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = event.scheduledAt.slice(0, 10);
      const bucket = days.get(key);
      if (bucket) bucket.push(event);
      else days.set(key, [event]);
    }
    return [...days.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, dayEvents]) => ({ date, events: dayEvents }));
  }
}
