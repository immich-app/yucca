import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerCustomOptions, SwaggerDocumentOptions, SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const useSwagger = (app: INestApplication, { write }: { write: boolean }) => {
  const builder = new DocumentBuilder().setTitle('yucca-admin').setDescription('yucca admin API').addServer('/');

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
    customSiteTitle: 'yucca admin API Documentation',
  };

  SwaggerModule.setup('doc', app, specification, customOptions);

  if (write) {
    // Generate API Documentation only in development mode
    const outputPath = resolve(process.cwd(), 'openapi-specs.json');
    writeFileSync(outputPath, JSON.stringify(specification, null, 2), { encoding: 'utf8' });
  }
};
