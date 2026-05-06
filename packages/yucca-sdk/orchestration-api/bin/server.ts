import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ORCHESTRATION_PORT, OrchestrationApiModule } from '../src';

async function bootstrap() {
  const app = await NestFactory.create(
    OrchestrationApiModule.forRoot({
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
  );

  app.enableCors({ origin: 'http://localhost:36066' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.setGlobalPrefix('api');
  await app.listen(ORCHESTRATION_PORT, '127.0.0.1');
}

void bootstrap();
