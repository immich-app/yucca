import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().default(80),
  MAILPIT_URL: z.url().default('http://localhost:8025'),
});

export const env = schema.parse(process.env);
