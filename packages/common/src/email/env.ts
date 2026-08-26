import z from 'zod';

export const emailEnv = z
  .object({
    POSTMARK_API_URL: z.url().default('https://api.postmarkapp.com'),
    // optional, email skip sending if not present
    POSTMARK_SERVER_TOKEN: z.string().optional(),
    EMAIL_FROM_ADDRESS: z.string().default('FUTO Backups <noreply@backups.futo.cloud>'),
  })
  .parse(process.env);
