import type { StringValue } from 'ms';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test', 'provision']).default('development'),

  YUCCA_ADMIN_API_PORT: z.coerce.number().min(1000),

  POSTGRES_HOST: z.string(),
  POSTGRES_PORT: z.coerce.number().default(5432),
  POSTGRES_USERNAME: z.string(),
  POSTGRES_PASSWORD: z.string(),
  POSTGRES_DATABASE: z.string(),
  POSTGRES_SSL: z.union([z.enum(['require', 'allow', 'prefer', 'verify-full']), z.boolean()]).default(false),

  JWT_PRIVATE_KEY: z.string(),
  JWT_EXPIRES_IN: z
    .string()
    .regex(/^\d+\s*(ms|s|m|h|d|w|y)$/i, 'Expected a duration like "1d", "30m", "3600s"')
    .default('24h')
    .transform((value): StringValue => value as StringValue),

  // Restic repository tokens (POST /repository/:id/url): signed with
  // yucca-api's key so michael accepts them. Optional — the endpoint returns
  // 501 until both are configured.
  RESTIC_JWT_PRIVATE_KEY: z.string().optional(),
  RESTIC_JWT_EXPIRES_IN: z
    .string()
    .regex(/^\d+\s*(ms|s|m|h|d|w|y)$/i, 'Expected a duration like "1d", "30m", "3600s"')
    .default('1d')
    .transform((value): StringValue => value as StringValue),
  RESTIC_ENDPOINT: z.url().optional(),
  // Hard ceiling for admin-requested token TTLs (POST /repository/:id/url).
  RESTIC_JWT_MAX_EXPIRES_IN: z
    .string()
    .regex(/^\d+\s*(ms|s|m|h|d|w|y)$/i, 'Expected a duration like "90d", "30m", "3600s"')
    .default('90d')
    .transform((value): StringValue => value as StringValue),

  // Revocation denylist writes; unset disables them (loud warn at startup).
  REDIS_URL: z.string().optional(),

  OIDC_ADMIN_ISSUER: z.url().transform((url) => new URL(url)),
  OIDC_ADMIN_CLIENT_ID: z.string(),
  OIDC_ADMIN_CLIENT_SECRET: z.string(),
  OIDC_ADMIN_ALLOW_INSECURE: z.coerce.boolean().default(false),
  OIDC_ADMIN_REQUIRE_PKCE: z.coerce.boolean().default(true),
  OIDC_ADMIN_REDIRECT_URI: z.string(),
  OIDC_ADMIN_LOGOUT_REDIRECT_URI: z.string(),
  OIDC_ADMIN_SCOPE: z.string().default('openid profile email'),
});

export const env = schema.parse(process.env);
