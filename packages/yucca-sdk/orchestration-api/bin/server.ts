import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ORCHESTRATION_PORT, OrchestrationApiModule } from '../src';

async function bootstrap() {
  const app = await NestFactory.create(
    OrchestrationApiModule.forRoot({
      yuccaProductionApi: 'http://localhost:5173',
    }),
  );

  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.setGlobalPrefix('/api');
  await app.listen(ORCHESTRATION_PORT);
}

void bootstrap();
