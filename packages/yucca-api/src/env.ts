import { z } from 'zod';

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test', 'provision']).default('development'),

    YUCCA_API_PORT: z.coerce.number().min(1000),

    JWT_SECRET: z.string().min(32),

    POSTGRES_HOST: z.string(),
    POSTGRES_PORT: z.coerce.number().default(5432),
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
    OIDC_LOGOUT_REDIRECT_URI: z.string(),
    OIDC_SCOPE: z.string().default('openid profile email'),

    // temp.
    RESTIC_API_HOST: z.string().default('localhost'),
    RESTIC_API_PORT: z.coerce.number().min(1000),
    RESTIC_ENDPOINT: z.string().optional(),
  })
  .transform(({ RESTIC_ENDPOINT, ...options }) => ({
    ...options,
    RESTIC_ENDPOINT: RESTIC_ENDPOINT ?? `http://${options.RESTIC_API_HOST}:${options.RESTIC_API_PORT}`,
  }));

export const env = schema.parse(process.env);
