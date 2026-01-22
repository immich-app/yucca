import './utils/otel';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
// import { raw } from 'express';
import { AppModule } from './app.module';
import env from './env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useGlobalPipes(new ValidationPipe());
  // TODO? app.use(raw({ type: ContentType.Binary, limit: '100mb' }));
  await app.listen(env.RESTIC_API_PORT);
}

void bootstrap();
