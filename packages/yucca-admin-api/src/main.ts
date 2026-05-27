import '@common/server/otel';

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { env } from './env';
import { useSwagger } from './utils/openapi';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.setGlobalPrefix('/api');
  useSwagger(app, { write: env.NODE_ENV === 'development' });
  await app.listen(env.YUCCA_ADMIN_API_PORT);
}

void bootstrap();
