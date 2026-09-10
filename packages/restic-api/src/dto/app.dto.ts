import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const BlobInfoResponseSchema = z
  .object({
    name: z.string(),
    size: z.number(),
  })
  .meta({ id: 'BlobInfoResponseDto' });

export class BlobInfoResponseDto extends createZodDto(BlobInfoResponseSchema) {}
