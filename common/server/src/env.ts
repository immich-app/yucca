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

  OIDC_ISSUER: z.url().transform((url) => new URL(url)),
  OIDC_CLIENT_ID: z.string(),
  OIDC_CLIENT_SECRET: z.string(),
  OIDC_ALLOW_INSECURE: z.coerce.boolean().default(false),
  OIDC_REQUIRE_PKCE: z.coerce.boolean().default(true),
  OIDC_REDIRECT_URI: z.string(),
  OIDC_SCOPE: z.string().default('openid'),
});

export const env = schema.parse(process.env);

export default env;
