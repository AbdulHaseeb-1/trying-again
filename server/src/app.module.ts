import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';

import { AgentModule } from './agent/agent.module';
import { AgentSettingsModule } from './agent/settings/agent-settings.module';
import { CalendarModule } from './calendar/calendar.module';
import { DatabaseModule } from './database/database.module';
import { calendarConfig, derivativesConfig } from './config/configuration';
import { DerivativesModule } from './derivatives/derivatives.module';
import { NewsModule } from './news/news.module';
import { SearchModule } from './search/search.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [calendarConfig, derivativesConfig], cache: true }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot({ maxListeners: 50 }),
    DatabaseModule,
    AgentSettingsModule,
    CalendarModule,
    DerivativesModule,
    NewsModule,
    SearchModule,
    AgentModule,
  ],
})
export class AppModule {}
