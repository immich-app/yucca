import z from 'zod';

export const otelEnv = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test', 'provision']).default('development'),

    OTEL_DEBUG: z.coerce.boolean(),
    OTEL_SAMPLE_RATE: z.number().min(0).max(1).default(1),
    OTEL_METRICS_EXPORT_INTERVAL: z.number().default(10_000),
    OTEL_METRICS: z.string().default('http://localhost:8428/opentelemetry/v1/metrics'),
    OTEL_TRACING: z.string().default('http://localhost:10428/insert/opentelemetry/v1/traces'),
    OTEL_LOGGING: z.string().default('http://localhost:9428/insert/opentelemetry/v1/logs'),
  })
  .parse(process.env);
