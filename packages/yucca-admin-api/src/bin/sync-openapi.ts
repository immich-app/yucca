import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from 'src/app.module';
import { useSwagger } from 'src/utils/openapi';

async function main() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { preview: true });
  app.setGlobalPrefix('/api');
  useSwagger(app, { write: true });
  await app.close();
}

// eslint-disable-next-line unicorn/no-process-exit
void main().finally(() => process.exit(0));
