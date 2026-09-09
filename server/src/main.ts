import 'reflect-metadata';

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import type { CalendarConfig } from './config/configuration';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService).getOrThrow<CalendarConfig>('calendar');

  app.enableCors({ origin: config.http.corsOrigin });
  app.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: false }),
  );
  app.enableShutdownHooks();

  SwaggerModule.setup(
    'docs',
    app,
    SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('MarketPulse Calendar API')
        .setDescription('ForexFactory economic calendar, scraped and kept warm.')
        .setVersion('1.0.0')
        .build(),
    ),
  );

  await app.listen(config.http.port, '0.0.0.0');
  new Logger('Bootstrap').log(`calendar API listening on http://localhost:${config.http.port}`);
}

void bootstrap();
