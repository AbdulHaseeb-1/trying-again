import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';

import { CalendarModule } from './calendar/calendar.module';
import { calendarConfig } from './config/configuration';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [calendarConfig], cache: true }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot({ maxListeners: 50 }),
    CalendarModule,
  ],
})
export class AppModule {}
