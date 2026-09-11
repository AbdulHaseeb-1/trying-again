import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { CalendarService } from '../../calendar/calendar.service';
import { IMPACT_ORDER, type Impact } from '../../calendar/calendar.types';
import { DerivativesService } from '../../derivatives/derivatives.service';
import type { AnyAppTool, AppTool, AppToolProvider } from './tool-definition';
import { appReference } from './tool-support';

const empty = z.object({});

/**
 * The application itself: what the user has selected, what the workspace is,
 * and the economic calendar the rest of the product is built around.
 *
 * The calendar sits here rather than under "market" deliberately — it is
 * application data with its own identity and its own detail screen, and an
 * agent that mentions a release should be able to point at the entry the user
 * can open.
 */
@Injectable()
export class AppTools implements AppToolProvider {
  constructor(
    private readonly calendar: CalendarService,
    private readonly derivatives: DerivativesService,
  ) {}

  tools(): AnyAppTool[] {
    return [
      this.workspace(),
      this.session(),
      this.selectedContext(),
      this.calendarWindow(),
      this.nextRelease(),
    ] as AnyAppTool[];
  }

  private workspace(): AppTool<typeof empty> {
    return {
      name: 'get_current_workspace',
      description:
        'The workspace the user is in, the symbols the application tracks, and how fresh its data is.',
      domain: 'app',
      capability: 'app.read',
      level: 'READ',
      parameters: empty,
      timeoutMs: 3_000,
      label: () => 'Reading the workspace',
      summary: (output) => (output as { workspace: string | null }).workspace ?? 'default',
      execute: async (_input, { run }) => ({
        workspace: run.activeWorkspace,
        locale: run.locale,
        timezone: run.timezone,
        trackedSymbols: this.derivatives.available,
        liquidityMapSymbols: this.derivatives.mappedSymbols,
        marketDataCapturedAt: this.derivatives.capturedAt,
        calendarEvents: this.calendar.count,
      }),
    };
  }

  private session(): AppTool<typeof empty> {
    return {
      name: 'get_current_session',
      description: 'The current conversation and application session identifiers.',
      domain: 'app',
      capability: 'app.read',
      level: 'READ',
      parameters: empty,
      timeoutMs: 2_000,
      label: () => 'Reading the session',
      summary: () => 'session details',
      execute: async (_input, { run }) => ({
        sessionId: run.sessionId,
        conversationId: run.conversationId,
        runId: run.runId,
        startedAt: new Date().toISOString(),
      }),
    };
  }

  private selectedContext(): AppTool<typeof empty> {
    return {
      name: 'get_user_selected_context',
      description:
        'The context the user explicitly attached to this conversation — charts, sessions, news items or snapshots they pinned to the question.',
      domain: 'app',
      capability: 'app.read',
      level: 'READ',
      parameters: empty,
      timeoutMs: 2_000,
      label: () => 'Reading attached context',
      summary: (output) => {
        const row = output as { attachments: unknown[] };
        return row.attachments.length === 0
          ? 'nothing attached'
          : `${row.attachments.length} attached`;
      },
      references: (output) => {
        const row = output as { attachments: { kind: string; id: string; label: string }[] };
        return row.attachments.map((attachment) =>
          appReference({
            title: attachment.label,
            entityId: attachment.id,
            surface: attachment.kind,
          }),
        );
      },
      execute: async (_input, { run }) => ({
        attachments: run.attachments,
        selectedSymbol: run.selectedSymbol,
        selectedTimeframe: run.selectedTimeframe,
      }),
    };
  }

  private calendarWindow() {
    const parameters = z.object({
      minImpact: z.enum(IMPACT_ORDER).describe('Drop anything below this impact.').nullable(),
      currencies: z
        .array(z.string())
        .describe('Restrict to these currency codes, e.g. ["USD"]. Empty for all.'),
      releasedOnly: z.boolean().describe('Only events whose number has printed.'),
      limit: z.number().int().min(1).max(40).describe('How many events to return.'),
    });
    return {
      name: 'get_economic_calendar',
      description:
        'Scheduled and printed economic releases in the rolling window the application tracks.',
      domain: 'app',
      capability: 'app.read',
      level: 'READ',
      parameters,
      timeoutMs: 5_000,
      label: () => 'Reading the economic calendar',
      summary: (output: unknown) => {
        const row = output as { events: unknown[] };
        return `${row.events.length} events`;
      },
      references: (output: unknown) => {
        const row = output as { events: { id: string; title: string; currency: string }[] };
        return row.events
          .slice(0, 5)
          .map((event) =>
            appReference({
              title: `${event.currency} ${event.title}`,
              entityId: event.id,
              surface: 'calendar_event',
            }),
          );
      },
      execute: async (input: z.infer<typeof parameters>) => {
        const events = this.calendar
          .query({
            minImpact: (input.minImpact ?? undefined) as Impact | undefined,
            currencies: input.currencies.length > 0 ? input.currencies : undefined,
          })
          .filter((event) => (input.releasedOnly ? event.released : true))
          .slice(0, input.limit);
        return {
          window: {
            from: this.calendar.window().from.toISOString(),
            to: this.calendar.window().to.toISOString(),
          },
          events: events.map((event) => ({
            id: event.id,
            title: event.title,
            currency: event.currency,
            impact: event.impact,
            scheduledAt: event.scheduledAt,
            actual: event.actual,
            forecast: event.forecast,
            previous: event.previous,
            outcome: event.outcome,
            released: event.released,
          })),
        };
      },
    } satisfies AppTool<typeof parameters>;
  }

  private nextRelease(): AppTool<typeof empty> {
    return {
      name: 'get_next_release',
      description: 'The next economic release that has not printed yet.',
      domain: 'app',
      capability: 'app.read',
      level: 'READ',
      parameters: empty,
      timeoutMs: 3_000,
      label: () => 'Checking the next release',
      summary: (output) => {
        const row = output as { title: string | null };
        return row.title ?? 'nothing scheduled';
      },
      references: (output) => {
        const row = output as { id: string | null; title: string | null; currency: string | null };
        if (!row.id || !row.title) return [];
        return [
          appReference({
            title: `${row.currency ?? ''} ${row.title}`.trim(),
            entityId: row.id,
            surface: 'calendar_event',
          }),
        ];
      },
      execute: async () => {
        const next = this.calendar.nextRelease();
        if (!next) {
          return { id: null, title: null, currency: null, scheduledAt: null, impact: null };
        }
        return {
          id: next.id,
          title: next.title,
          currency: next.currency,
          scheduledAt: next.scheduledAt,
          impact: next.impact,
          forecast: next.forecast,
          previous: next.previous,
          minutesAway: Math.round((Date.parse(next.scheduledAt) - Date.now()) / 60_000),
        };
      },
    };
  }
}
