import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { DeviceFlowEventType, DeviceFlowFailureReason } from '../enum';

const DeviceFlowEventSchema = z
  .object({
    type: z.enum(DeviceFlowEventType).meta({ id: 'DeviceFlowEventType' }),
    userCode: z.string().optional(),
    verificationUri: z.string().optional(),
    token: z.string().optional(),
    backendId: z.string().optional(),
    reason: z.enum(DeviceFlowFailureReason).meta({ id: 'DeviceFlowFailureReason' }).optional(),
  })
  .meta({ id: 'DeviceFlowEventDto' });

const CreateSessionRequestSchema = z.object({ token: z.string() }).meta({ id: 'CreateSessionRequestDto' });

export class DeviceFlowEventDto extends createZodDto(DeviceFlowEventSchema) {}
export class CreateSessionRequestDto extends createZodDto(CreateSessionRequestSchema) {}
