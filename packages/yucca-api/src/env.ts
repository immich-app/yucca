import type { StringValue } from 'ms';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test', 'provision']).default('development'),

  YUCCA_API_PORT: z.coerce.number().min(1000),

  JWT_PRIVATE_KEY: z.string(),
  JWT_EXPIRES_IN: z
    .string()
    .regex(/^\d+\s*(ms|s|m|h|d|w|y)$/i, 'Expected a duration like "1d", "30m", "3600s"')
    .default('1d')
    .transform((value): StringValue => value as StringValue),

  POSTGRES_HOST: z.string(),
  POSTGRES_PORT: z.coerce.number().default(5432),
  POSTGRES_USERNAME: z.string(),
  POSTGRES_PASSWORD: z.string(),
  POSTGRES_DATABASE: z.string(),
  POSTGRES_SSL: z.union([z.enum(['require', 'allow', 'prefer', 'verify-full']), z.boolean()]).default(false),

  ALLOWED_EMAIL_DOMAINS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((domain) => domain.trim().toLowerCase())
        .filter(Boolean),
    ),

  OIDC_ISSUER: z.url().transform((url) => new URL(url)),
  OIDC_CLIENT_ID: z.string(),
  OIDC_CLIENT_SECRET: z.string(),
  OIDC_ALLOW_INSECURE: z.coerce.boolean().default(false),
  OIDC_REQUIRE_PKCE: z.coerce.boolean().default(true),
  OIDC_REDIRECT_URI: z.string(),
  OIDC_LOGOUT_REDIRECT_URI: z.string(),
  OIDC_SCOPE: z.string().default('openid profile email'),

  OIDC_DEVICE_ISSUER: z.url().transform((url) => new URL(url)),
  OIDC_DEVICE_CLIENT_ID: z.string(),
  OIDC_DEVICE_ALLOW_INSECURE: z.coerce.boolean().default(false),
  OIDC_DEVICE_SCOPE: z.string().default('openid profile email'),

  TOPOLOGY_FILE: z.string().default('./topology.dev.json'),
  API_ROOT: z.string().default('http://localhost:3020/api'),
  LEGACY_SITE_CODE: z.string(),
  LEGACY_STORAGE_CLUSTER_CODE: z.string(),

  RESTIC_JWT_EXPIRES_IN: z
    .string()
    .regex(/^\d+\s*(ms|s|m|h|d|w|y)$/i, 'Expected a duration like "90d", "8760h"')
    .default('90d')
    .transform((value): StringValue => value as StringValue),
  RESTIC_JWT_MAX_EXPIRES_IN: z
    .string()
    .regex(/^\d+\s*(ms|s|m|h|d|w|y)$/i, 'Expected a duration like "365d"')
    .default('365d')
    .transform((value): StringValue => value as StringValue),

  TOKEN_INTROSPECTION_SECRET: z.string().optional(),

  REDIS_URL: z.string().optional(),
});

export const env = schema.parse(process.env);
