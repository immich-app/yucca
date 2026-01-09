import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
// import { raw } from 'express';
import { AppModule } from './app.module';
import env from './env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe());
  // TODO? app.use(raw({ type: 'application/octet-stream', limit: '100mb' }));
  await app.listen(env.PORT);
}

void bootstrap();
