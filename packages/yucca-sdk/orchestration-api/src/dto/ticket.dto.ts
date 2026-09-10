import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { TicketAction } from '../enum';

const TicketCreateRequestSchema = z
  .object({
    action: z.enum(TicketAction).meta({ id: 'TicketAction' }),
    repositoryId: z.uuid().describe('Repository the ticket is bound to'),
  })
  .meta({ id: 'TicketCreateRequestDto' });

const TicketCreateResponseSchema = z
  .object({ redirectTo: z.string().describe('Identity provider URL the browser must be sent to') })
  .meta({ id: 'TicketCreateResponseDto' });

export class TicketCreateRequestDto extends createZodDto(TicketCreateRequestSchema) {}
export class TicketCreateResponseDto extends createZodDto(TicketCreateResponseSchema) {}
