import { z } from 'zod';

const schema = z.object({
  RESTIC_API_PORT: z.coerce.number().min(1000).default(3010),
  YUCCA_API_PORT: z.coerce.number().min(1000).default(3000),

  JWT_SECRET: z.string().min(32),
});

const env = schema.parse(process.env);

export default env;
