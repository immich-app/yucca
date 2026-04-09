import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ORCHESTRATION_PORT, OrchestrationApiModule } from '../src';

async function bootstrap() {
  const app = await NestFactory.create(
    OrchestrationApiModule.forRoot({
      yuccaProductionApi: 'http://localhost:5173',
    }),
  );

  app.enableCors({ origin: 'http://localhost:5174' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.setGlobalPrefix('/api/yucca');
  await app.listen(ORCHESTRATION_PORT, '127.0.0.1');
}

void bootstrap();
