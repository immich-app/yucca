import { z } from 'zod';

const schema = z.object({
  RESTIC_API_PORT: z.coerce.number().min(1000),
  YUCCA_API_PORT: z.coerce.number().min(1000),

  JWT_PRIVATE_KEY: z.string(),

  // A restic token has to carry its repository's own S3 credentials, sealed.
  STORAGE_CREDENTIAL_SEAL_KEY: z.string(),
  S3_ACCESS_KEY_ID: z.string(),
  S3_SECRET_ACCESS_KEY: z.string(),
});

export const env = schema.parse(process.env);
