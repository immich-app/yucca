import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const AuthSchema = z
  .object({
    user: z.uuid(),
    repository: z.uuid(),
    writeOnce: z.boolean(),
  })
  .meta({ id: 'AuthDto' });

export class AuthDto extends createZodDto(AuthSchema) {}
