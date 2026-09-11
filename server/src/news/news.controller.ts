import { Controller, Get, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { NewsQueryDto } from './dto/news-query.dto';
import { NewsService } from './news.service';

/**
 * News over HTTP.
 *
 * The same store the agent tools read, exposed so the app can render a story a
 * citation points at without a second source of truth for "what is a news item".
 */
@ApiTags('news')
@Controller('api/news')
export class NewsController {
  constructor(private readonly news: NewsService) {}

  @Get()
  @ApiOperation({ summary: 'Search or page the news store, newest first.' })
  @ApiOkResponse({ description: 'A page of news items plus an opaque next cursor.' })
  list(@Query() query: NewsQueryDto) {
    return this.news.search(query);
  }

  @Get('status')
  @ApiOperation({ summary: 'Providers, storage backend and the last sync.' })
  async status() {
    return {
      now: new Date().toISOString(),
      providers: this.news.providerIds,
      storage: this.news.backend,
      count: await this.news.count(),
      lastSync: this.news.lastOutcome,
    };
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Poll every configured news provider now.' })
  refresh() {
    return this.news.sync();
  }

  @Get('symbol/:symbol')
  @ApiOperation({ summary: 'Latest news mentioning one symbol.' })
  bySymbol(@Param('symbol') symbol: string, @Query() query: NewsQueryDto) {
    return this.news.forSymbol(symbol, query.limit ?? 10);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One news item by its internal id.' })
  async byId(@Param('id') id: string) {
    const item = await this.news.byId(id);
    if (!item) throw new NotFoundException(`No news item "${id}".`);
    return item;
  }

  @Get(':id/related')
  @ApiOperation({ summary: 'Stories about the same symbols, around the same time.' })
  async related(@Param('id') id: string) {
    const item = await this.news.byId(id);
    if (!item) throw new NotFoundException(`No news item "${id}".`);
    return { items: await this.news.related(id) };
  }
}
