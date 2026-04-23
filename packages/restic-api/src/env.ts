import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test', 'provision']).default('development'),

  RESTIC_API_PORT: z.coerce.number().min(1000),

  JWT_PUBLIC_KEY: z.string(),

  S3_ACCESS_KEY_ID: z.string(),
  S3_SECRET_ACCESS_KEY: z.string(),
  S3_REGION: z.string(),
  S3_ENDPOINT: z.string(),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(false),

  OTEL_DEBUG: z.coerce.boolean(),
  OTEL_SAMPLE_RATE: z.number().min(0).max(1).default(1),
  OTEL_METRICS_EXPORT_INTERVAL: z.number().default(10_000),
  OTEL_METRICS: z.string().default('http://localhost:8428/opentelemetry/v1/metrics'),
  OTEL_TRACING: z.string().default('http://localhost:10428/insert/opentelemetry/v1/traces'),
  OTEL_LOGGING: z.string().default('http://localhost:9428/insert/opentelemetry/v1/logs'),
});

export const env = schema.parse(process.env);
