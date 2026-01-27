import { env } from '@common/server/env';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { useSwagger } from './utils/openapi';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe());
  app.setGlobalPrefix('/api');
  useSwagger(app, { write: env.NODE_ENV === 'development' });
  await app.listen(env.YUCCA_API_PORT);
}

void bootstrap();
