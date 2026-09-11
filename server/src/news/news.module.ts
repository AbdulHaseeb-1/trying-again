import { Module } from '@nestjs/common';

import { CalendarModule } from '../calendar/calendar.module';
import { CalendarNewsProvider } from './providers/calendar-news.provider';
import { NEWS_PROVIDERS, type NewsProvider } from './providers/news-provider';
import { NewsController } from './news.controller';
import { NewsRepository } from './news.repository';
import { NewsScheduler } from './news.scheduler';
import { NewsService } from './news.service';
import { RssNewsProvider } from './providers/rss-news.provider';

/**
 * News, as its own subsystem rather than a screen's private helper.
 *
 * Providers are collected into one injection token, so adding a source means
 * adding a class here and nothing else: `NewsService` iterates whatever is
 * registered and has no knowledge of which sources exist.
 */
@Module({
  imports: [CalendarModule],
  controllers: [NewsController],
  providers: [
    NewsRepository,
    NewsService,
    NewsScheduler,
    CalendarNewsProvider,
    RssNewsProvider,
    {
      provide: NEWS_PROVIDERS,
      inject: [CalendarNewsProvider, RssNewsProvider],
      useFactory: (...providers: NewsProvider[]) => providers,
    },
  ],
  exports: [NewsService, NewsRepository],
})
export class NewsModule {}
