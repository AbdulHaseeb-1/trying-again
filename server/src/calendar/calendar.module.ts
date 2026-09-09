import { Module } from '@nestjs/common';

import { BrowserModule } from '../browser/browser.module';
import { CalendarController } from './calendar.controller';
import { CalendarScheduler } from './calendar.scheduler';
import { CalendarService } from './calendar.service';
import { CalendarSnapshot } from './calendar.snapshot';
import { CalendarStore } from './calendar.store';
import { ForexFactoryFeed } from './sources/forex-factory.feed';
import { ForexFactoryScraper } from './sources/forex-factory.scraper';

@Module({
  imports: [BrowserModule],
  controllers: [CalendarController],
  providers: [
    CalendarService,
    CalendarStore,
    CalendarSnapshot,
    CalendarScheduler,
    ForexFactoryScraper,
    ForexFactoryFeed,
  ],
  exports: [CalendarService],
})
export class CalendarModule {}
