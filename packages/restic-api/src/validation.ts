import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { BlobType } from './enum';

const BlobParamsSchema = z.object({ type: z.enum(BlobType) }).meta({ id: 'BlobParamsDto' });

const BlobWithNameParamsSchema = BlobParamsSchema.extend({
  name: z.string().regex(/^[a-f0-9]{64}$/),
}).meta({ id: 'BlobWithNameParamsDto' });

export class BlobParamsDto extends createZodDto(BlobParamsSchema) {}
export class BlobWithNameParamsDto extends createZodDto(BlobWithNameParamsSchema) {}
