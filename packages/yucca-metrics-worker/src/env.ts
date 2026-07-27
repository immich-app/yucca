import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test', 'provision']).default('development'),

  YUCCA_METRICS_WORKER_PORT: z.coerce.number().min(1000),

  POSTGRES_HOST: z.string(),
  POSTGRES_PORT: z.coerce.number().default(5432),
  POSTGRES_USERNAME: z.string(),
  POSTGRES_PASSWORD: z.string(),
  POSTGRES_DATABASE: z.string(),
  POSTGRES_SSL: z.union([z.enum(['require', 'allow', 'prefer', 'verify-full']), z.boolean()]).default(false),

  RADOS_ENDPOINT: z.url().transform((url) => new URL(url)),
  RADOS_ACCESS_KEY_ID: z.string(),
  RADOS_SECRET_ACCESS_KEY: z.string(),

  // Revocation reconcile target; unset skips the reconcile cron.
  REDIS_URL: z.string().optional(),
});

export const env = schema.parse(process.env);
