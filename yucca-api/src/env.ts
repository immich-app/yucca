import { z } from 'zod';

const schema = z.object({
  YUCCA_API_PORT: z.coerce.number().min(1000).default(3000),

  JWT_SECRET: z.string().min(32),

  POSTGRES_HOST: z.string(),
  POSTGRES_PORT: z.number().default(5432),
  POSTGRES_USERNAME: z.string(),
  POSTGRES_PASSWORD: z.string(),
  POSTGRES_DATABASE: z.string(),
  POSTGRES_SSL: z.union([z.enum(['require', 'allow', 'prefer', 'verify-full']), z.boolean()]).default(false),
});

const env = schema.parse(process.env);

export default env;
