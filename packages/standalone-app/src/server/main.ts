import { LoggingRepository, OrchestrationApiModule } from '@futo-org/backups-orchestrator-api';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import { mkdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readEnv } from './env';

async function bootstrap() {
  const env = readEnv();
  const uiPath = env.uiPath ?? resolve(process.cwd(), 'build');
  const indexHtml = resolve(uiPath, 'index.html');

  await stat(indexHtml);

  await mkdir(env.statePath, { recursive: true });

  const app = await NestFactory.create<NestExpressApplication>(
    OrchestrationApiModule.forRootAsync({
      useFactory: () => ({
        statePath: env.statePath,
        wellKnownUrl: env.wellKnownUrl,
        requireSession: !env.disableAuth,
      }),
    }),
  );

  const logger = await app.resolve(LoggingRepository);
  logger.setContext('Bootstrap');

  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.setGlobalPrefix('api');

  app.use(
    express.static(uiPath, {
      setHeaders: (response, path) => {
        if (path.includes('/_app/immutable/')) {
          response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }),
  );
  app.use((request: express.Request, response: express.Response, next: express.NextFunction) => {
    if (request.method !== 'GET' || request.path.startsWith('/api') || request.path.startsWith('/_app/')) {
      next();
      return;
    }
    response.sendFile(indexHtml);
  });

  await app.listen(env.port, env.host);

  logger.log(`FUTO Backups listening on http://${env.host}:${env.port}`);
  logger.log(`State directory: ${env.statePath}`);
}

void bootstrap();
