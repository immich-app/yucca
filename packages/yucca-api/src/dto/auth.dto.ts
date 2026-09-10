import { createZodDto } from 'nestjs-zod';
import { DeviceFlowEventType, DeviceFlowFailureReason } from 'src/enum';
import { z } from 'zod';

const AuthSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    sessionId: z.string(),
    connectionId: z.string().nullable(),
    features: z.record(z.string(), z.boolean()),
  })
  .meta({ id: 'AuthDto' });

const DeviceFlowEventSchema = z
  .object({
    type: z.enum(DeviceFlowEventType).meta({ id: 'DeviceFlowEventType' }),
    userCode: z.string().optional(),
    verificationUri: z.string().optional(),
    accessToken: z.string().optional(),
    userId: z.string().optional(),
    reason: z.enum(DeviceFlowFailureReason).meta({ id: 'DeviceFlowFailureReason' }).optional(),
  })
  .meta({ id: 'DeviceFlowEventDto' });

export class AuthDto extends createZodDto(AuthSchema) {}
export class DeviceFlowEventDto extends createZodDto(DeviceFlowEventSchema) {}
