import '@common/server/otel';

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { env } from './env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(env.YUCCA_METRICS_WORKER_PORT);
}

void bootstrap();
