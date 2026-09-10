import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const ColumboInvestigateRequestSchema = z
  .object({
    userId: z.uuid(),
    prompt: z.string().max(2000),
  })
  .meta({ id: 'ColumboInvestigateRequestDto' });

const ColumboInvestigationSchema = z
  .object({
    id: z.string(),
    status: z.enum(['running', 'done', 'failed']),
    note: z.string().nullable(),
    queries: z.array(z.string()),
    error: z.string().nullable(),
    toolCalls: z.number(),
    promptTokens: z.number(),
    completionTokens: z.number(),
  })
  .meta({ id: 'ColumboInvestigationDto' });

export class ColumboInvestigateRequestDto extends createZodDto(ColumboInvestigateRequestSchema) {}
export class ColumboInvestigationDto extends createZodDto(ColumboInvestigationSchema) {}
