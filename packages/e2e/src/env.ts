import { z } from 'zod';

const schema = z.object({
  RESTIC_API_PORT: z.coerce.number().min(1000),
  YUCCA_API_PORT: z.coerce.number().min(1000),

  JWT_PRIVATE_KEY: z.string(),
});

export const env = schema.parse(process.env);
