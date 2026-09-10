import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const SessionSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
  })
  .meta({ id: 'SessionDto' });

const SessionListResponseSchema = z.object({ items: z.array(SessionSchema) }).meta({ id: 'SessionListResponseDto' });

export class SessionDto extends createZodDto(SessionSchema) {}
export class SessionListResponseDto extends createZodDto(SessionListResponseSchema) {}
