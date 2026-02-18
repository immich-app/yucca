import '@common/server/otel';

import { env } from '@common/server/env';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.useGlobalPipes(new ValidationPipe());
  await app.listen(env.RESTIC_API_PORT);
}

void bootstrap();
