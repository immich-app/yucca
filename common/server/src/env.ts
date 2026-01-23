import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test', 'provision']).default('development'),

  RESTIC_API_PORT: z.coerce.number().min(1000),
  YUCCA_API_PORT: z.coerce.number().min(1000),

  JWT_SECRET: z.string().min(32),

  S3_ACCESS_KEY_ID: z.string(),
  S3_SECRET_ACCESS_KEY: z.string(),
  S3_REGION: z.string(),
  S3_ENDPOINT: z.string(),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(false),

  POSTGRES_HOST: z.string(),
  POSTGRES_PORT: z.number().default(5432),
  POSTGRES_USERNAME: z.string(),
  POSTGRES_PASSWORD: z.string(),
  POSTGRES_DATABASE: z.string(),
  POSTGRES_SSL: z.union([z.enum(['require', 'allow', 'prefer', 'verify-full']), z.boolean()]).default(false),

  OTEL_DEBUG: z.coerce.boolean(),
  OTEL_METRICS_EXPORT_INTERVAL: z.number().default(10_000),
  OTEL_METRICS: z.string().default('http://localhost:8428/opentelemetry/v1/metrics'),
  OTEL_TRACING: z.string().default('http://localhost:10428/insert/opentelemetry/v1/traces'),
  OTEL_LOGGING: z.string().default('http://localhost:9428/insert/opentelemetry/v1/logs'),
});

const env = schema.parse(process.env);

export { env };
export default env;
