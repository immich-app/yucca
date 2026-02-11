import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { OrchestrationApiModule } from '../src/index.js';

async function bootstrap() {
  const app = await NestFactory.create(OrchestrationApiModule);
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe());
  app.setGlobalPrefix('/api');
  await app.listen(22676);
}

void bootstrap();
