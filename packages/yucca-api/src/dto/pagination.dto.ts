import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export const DEFAULT_PAGE_SIZE = 50;

const CursorPaginationSchema = z
  .object({
    cursor: z.iso.datetime({ offset: true }).optional(),
    limit: z.string().regex(/^\d+$/).optional().meta({ default: DEFAULT_PAGE_SIZE }),
  })
  .meta({ id: 'CursorPaginationDto' });

export class CursorPaginationDto extends createZodDto(CursorPaginationSchema) {}
