import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test', 'provision']).default('development'),

  FUTO_BACKUPS_BOT_PORT: z.coerce.number().min(1000),

  DISCORD_BOT_TOKEN: z.string().optional(),
  DISCORD_GUILD_ID: z.string().default(''),
  DISCORD_STAFF_ROLE_ID: z.string().default(''),
  DISCORD_SUPPORT_CHANNEL_ID: z.string().default(''),

  YUCCA_API_URL: z.url().default('http://localhost:3020'),
  INTERNAL_SECRET: z.string().default(''),
  WEB_URL: z.url().default('http://localhost:5173'),
  GRAFANA_USER_DASHBOARD_URL: z.string().default(''),

  TICKET_RETENTION_DAYS: z.coerce.number().default(14),
  TICKET_USER_LIMIT: z.coerce.number().int().positive().default(3),

  TRANSCRIPT_S3_ENDPOINT: z.string().default(''),
  TRANSCRIPT_S3_BUCKET: z.string().default(''),
  TRANSCRIPT_S3_ACCESS_KEY_ID: z.string().default(''),
  TRANSCRIPT_S3_SECRET_ACCESS_KEY: z.string().default(''),
  TRANSCRIPT_S3_REGION: z.string().default('rgw'),
});

export const env = schema.parse(process.env);
