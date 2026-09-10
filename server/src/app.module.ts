import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';

import { CalendarModule } from './calendar/calendar.module';
import { calendarConfig, derivativesConfig } from './config/configuration';
import { DerivativesModule } from './derivatives/derivatives.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [calendarConfig, derivativesConfig], cache: true }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot({ maxListeners: 50 }),
    CalendarModule,
    DerivativesModule,
  ],
})
export class AppModule {}
