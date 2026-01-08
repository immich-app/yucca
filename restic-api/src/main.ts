import { NestFactory } from '@nestjs/core';
import { raw } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(raw({ type: 'application/octet-stream', limit: '100mb' }));
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
