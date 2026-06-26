import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { LoggingRepository, ORCHESTRATION_PORT, OrchestrationApiModule } from '../src';

async function bootstrap() {
  const app = await NestFactory.create(
    OrchestrationApiModule.forRootAsync({
      useFactory: () => ({
        yuccaProductionApi: 'http://localhost:36033',
        developmentMode: true,
        immichIntegration: {
          dataFolders: ['upload', 'profile', 'library', 'backups', 'thumbs', 'encoded-video'],
          dataPath: '/immich_data',
          libraries: [
            {
              id: 'my-library',
              name: 'my library',
              importPaths: ['/immich_library'],
              exclusionPatterns: [],
            },
          ],
        },
      }),
    }),
  );

  const logger = await app.resolve(LoggingRepository);
  logger.setContext('Bootstrap');

  app.enableCors({ origin: 'http://localhost:36066' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.setGlobalPrefix('api');
  await app.listen(ORCHESTRATION_PORT, '127.0.0.1');

  logger.log(`Orchestration API listening on http://127.0.0.1:${ORCHESTRATION_PORT}`);
}

void bootstrap();
