import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ORCHESTRATION_PORT, OrchestrationApiModule } from '../src';

async function bootstrap() {
  const app = await NestFactory.create(
    OrchestrationApiModule.forRoot({
      yuccaProductionApi: 'http://localhost:5173',
      yuccaProductionIssuer: new URL('http://localhost:8092'),
      yuccaProductionClientId: 'client ID',
      yuccaProductionScope: 'client secret',
      yuccaProductionRequirePKCE: true,
    }),
  );

  app.enableCors();
  app.useGlobalPipes(new ValidationPipe());
  app.setGlobalPrefix('/api');
  await app.listen(ORCHESTRATION_PORT);
}

void bootstrap();
