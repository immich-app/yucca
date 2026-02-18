import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ORCHESTRATION_PORT, OrchestrationApiModule } from '../src';

async function bootstrap() {
  const app = await NestFactory.create(OrchestrationApiModule);
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe());
  app.setGlobalPrefix('/api');
  await app.listen(ORCHESTRATION_PORT);
}

void bootstrap();
