import { NestApplication, NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerCustomOptions, SwaggerDocumentOptions, SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ORCHESTRATION_PORT, OrchestrationApiModule } from '../src';

async function main() {
  const app = await NestFactory.create<NestApplication>(
    OrchestrationApiModule.forRootAsync({
      useFactory: () => ({}),
    }),
  );

  app.setGlobalPrefix('api');

  const builder = new DocumentBuilder()
    .setTitle('yucca')
    .setDescription('yucca SDK')
    .addServer('http://localhost:' + ORCHESTRATION_PORT);

  const config = builder.build();

  const options: SwaggerDocumentOptions = {
    operationIdFactory: (_: string, methodKey: string) => methodKey,
  };

  const specification = SwaggerModule.createDocument(app, config, options);

  const customOptions: SwaggerCustomOptions = {
    swaggerOptions: {
      persistAuthorization: true,
    },
    jsonDocumentUrl: '/api/spec.json',
    yamlDocumentUrl: '/api/spec.yaml',
    customSiteTitle: 'yucca SDK Documentation',
  };

  SwaggerModule.setup('doc', app, specification, customOptions);

  const outputPath = resolve(process.cwd(), 'openapi-specs.json');
  writeFileSync(outputPath, JSON.stringify(specification, null, 2), { encoding: 'utf8' });

  await app.close();
}

void main();
