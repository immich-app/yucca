import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().min(1000).default(3000),

  JWT_SECRET: z.string().min(32),

  S3_ACCESS_KEY_ID: z.string(),
  S3_SECRET_ACCESS_KEY: z.string(),
  S3_REGION: z.string(),
  S3_ENDPOINT: z.string(),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(false),
});

const env = schema.parse(process.env);

export default env;
