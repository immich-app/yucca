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

void main().then(
  // eslint-disable-next-line unicorn/no-process-exit
  () => process.exit(0),
  (error: unknown) => {
    console.error(error);
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1);
  },
);
