import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Query,
  ServiceUnavailableException,
  Sse,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { fromEvent, map, startWith, type Observable } from 'rxjs';

import { DerivativesScheduler } from './derivatives.scheduler';
import { DERIVATIVES_SYNCED, DerivativesService } from './derivatives.service';
import { DerivativesHistoryDto } from './dto/derivatives-history.dto';
import { DerivativesQueryDto } from './dto/derivatives-query.dto';
import { DerivativesConfigDto } from './dto/refresh-config.dto';

@ApiTags('derivatives')
@Controller('api/derivatives')
export class DerivativesController {
  constructor(
    private readonly derivatives: DerivativesService,
    private readonly scheduler: DerivativesScheduler,
    private readonly events: EventEmitter2,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'One asset breakdown plus the market context, in a single payload.',
  })
  @ApiOkResponse({ description: 'Asset, market overview and freshness metadata.' })
  overview(@Query() query: DerivativesQueryDto) {
    const available = this.derivatives.available;
    const symbol = query.symbol ?? available[0];
    const asset = symbol ? this.derivatives.asset(symbol) : null;
    if (query.symbol && !asset && available.length) {
      throw new NotFoundException(
        `no derivatives data for ${query.symbol}; available: ${available.join(', ')}`,
      );
    }

    return {
      generatedAt: new Date().toISOString(),
      capturedAt: this.derivatives.capturedAt,
      lastChangedAt: this.derivatives.changedAt,
      snapshotCapturedAt: this.derivatives.snapshotCapturedAt,
      refreshIntervalMs: this.scheduler.refreshIntervalMs,
      lastSync: this.derivatives.lastSync,
      available,
      symbol: asset?.summary.symbol ?? symbol ?? null,
      asset,
      market: this.derivatives.market,
    };
  }

  @Get('assets')
  @ApiOperation({ summary: 'Every tracked asset, fully expanded.' })
  assets() {
    return {
      capturedAt: this.derivatives.capturedAt,
      count: this.derivatives.assets.length,
      assets: this.derivatives.assets,
    };
  }

  @Get('market')
  @ApiOperation({ summary: 'Market-wide totals, exchange aggregates, screener and liquidations.' })
  market() {
    return {
      capturedAt: this.derivatives.capturedAt,
      market: this.derivatives.market,
    };
  }

  @Get('history')
  @ApiOperation({
    summary: 'One archived series: coin totals, venues, funding, prices, liquidations or market.',
  })
  @ApiOkResponse({ description: 'Stored rows, newest first.' })
  async history(@Query() query: DerivativesHistoryDto) {
    if (!this.derivatives.archiveEnabled) {
      throw new ServiceUnavailableException(
        'History needs the Postgres archive; set DATABASE_URL and run the migrations.',
      );
    }
    const series = query.series ?? 'asset';
    const rows = await this.derivatives.history(series, {
      symbol: query.symbol,
      exchange: query.exchange,
      from: query.from,
      to: query.to,
      limit: query.limit,
    });
    return {
      series,
      symbol: query.symbol ?? null,
      range: { from: query.from?.toISOString() ?? null, to: query.to?.toISOString() ?? null },
      count: rows.length,
      rows,
    };
  }

  @Get('status')
  @ApiOperation({ summary: 'Pipeline health: pages scraped, sync history, cadence.' })
  async status() {
    return {
      now: new Date().toISOString(),
      archive: {
        enabled: this.derivatives.archiveEnabled,
        lastWrite: this.derivatives.lastArchived,
        ...((await this.derivatives.archiveSummary()) ?? {}),
      },
      capturedAt: this.derivatives.capturedAt,
      snapshotCapturedAt: this.derivatives.snapshotCapturedAt,
      refreshIntervalMs: this.scheduler.refreshIntervalMs,
      available: this.derivatives.available,
      pages: this.derivatives.pages,
      lastSync: this.derivatives.lastSync,
      recentSyncs: this.derivatives.recentSyncs,
    };
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Scrape now, bypassing the interval.' })
  refresh() {
    return this.derivatives.sync('manual');
  }

  @Post('config')
  @ApiOperation({ summary: 'Retune the refresh loop at runtime.' })
  configure(@Body() body: DerivativesConfigDto) {
    if (body.refreshIntervalMs) this.scheduler.setRefreshInterval(body.refreshIntervalMs);
    return { refreshIntervalMs: this.scheduler.refreshIntervalMs };
  }

  /** Clients learn about a fresh scrape without waiting for their own poll. */
  @Sse('stream')
  @ApiOperation({ summary: 'Live stream of sync notifications.' })
  stream(): Observable<{ type: string; data: string }> {
    return fromEvent(this.events, DERIVATIVES_SYNCED).pipe(
      map((payload) => ({ type: 'sync', data: JSON.stringify(payload) })),
      startWith({ type: 'ready', data: JSON.stringify({ at: new Date().toISOString() }) }),
    );
  }
}
