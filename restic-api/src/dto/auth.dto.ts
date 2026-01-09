import z from 'zod';

export const authSchema = z.object({
  user: z.string(),
  repository: z.string(),
  writeOnce: z.boolean(),
});

export type AuthDto = z.infer<typeof authSchema>;
