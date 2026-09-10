import { createZodDto } from 'nestjs-zod';
import { TicketAction } from 'src/enum';
import { z } from 'zod';
import { RepositoryMeterSchema, RepositoryMetricsSchema } from './repository.dto';

const TicketActionSchema = z.enum(TicketAction).meta({ id: 'TicketAction' });

const TicketCreateRequestSchema = z
  .object({
    action: TicketActionSchema,
    repositoryId: z.uuid().describe('Repository the ticket is bound to'),
  })
  .meta({ id: 'TicketCreateRequestDto' });

const TicketCreateResponseSchema = z
  .object({ redirectTo: z.string().describe('IdP URL the browser must be sent to') })
  .meta({ id: 'TicketCreateResponseDto' });

const TicketSchema = z
  .object({
    id: z.string(),
    action: TicketActionSchema,
    repositoryId: z.string(),
    repositoryName: z.string(),
    metrics: RepositoryMetricsSchema,
    meter: RepositoryMeterSchema.optional(),
  })
  .meta({ id: 'TicketDto' });

export class TicketCreateRequestDto extends createZodDto(TicketCreateRequestSchema) {}
export class TicketCreateResponseDto extends createZodDto(TicketCreateResponseSchema) {}
export class TicketDto extends createZodDto(TicketSchema) {}
