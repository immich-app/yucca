import { z } from 'zod';

const schema = z.object({
  ISSUER: z.url().default('http://localhost:8092'),
  PORT: z.coerce.number().default(80),

  CLIENT_ID: z.string().default('client ID'),
  CLIENT_SECRET: z.string().default('client secret'),
  DEVICE_CLIENT_ID: z.string().default('device client ID'),

  REDIRECT_URI: z.url().default('http://localhost:36033/api/auth/oidc/callback'),
  TICKET_REDIRECT_URI: z.url().default('http://localhost:36033/api/auth/ticket/callback'),
  POST_LOGOUT_REDIRECT_URI: z.url().default('http://localhost:36033'),

  ADMIN_REDIRECT_URI: z.url().default('http://localhost:3030/api/auth/oidc/callback'),
  ADMIN_POST_LOGOUT_REDIRECT_URI: z.url().default('http://localhost:3030'),
});

export const env = schema.parse(process.env);
