import { z } from 'zod';

const schema = z.object({
  YUCCA_API_PORT: z.coerce.number().min(1000).default(3000),

  JWT_SECRET: z.string().min(32),
});

const env = schema.parse(process.env);

export default env;
