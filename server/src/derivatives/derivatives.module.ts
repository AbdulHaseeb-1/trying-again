import { Module } from '@nestjs/common';

import { BrowserModule } from '../browser/browser.module';
import { DerivativesArchive } from './derivatives.archive';
import { DerivativesController } from './derivatives.controller';
import { DerivativesScheduler } from './derivatives.scheduler';
import { DerivativesService } from './derivatives.service';
import { DerivativesSnapshotStore } from './derivatives.snapshot';
import { DerivativesStore } from './derivatives.store';
import { CoinglassScraper } from './sources/coinglass.scraper';

@Module({
  imports: [BrowserModule],
  controllers: [DerivativesController],
  providers: [
    DerivativesArchive,
    DerivativesService,
    DerivativesStore,
    DerivativesSnapshotStore,
    DerivativesScheduler,
    CoinglassScraper,
  ],
  exports: [DerivativesService],
})
export class DerivativesModule {}
