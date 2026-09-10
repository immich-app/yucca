import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { BackendType } from '../enum';

export const BackendTypeSchema = z.enum(BackendType).meta({ id: 'BackendType' });

const BackendSchema = z
  .object({
    id: z.string(),
    type: BackendTypeSchema,
    description: z.string(),
    isOnline: z.boolean(),
    error: z.string().optional(),
  })
  .meta({ id: 'BackendDto' });

const BackendsResponseSchema = z.object({ backends: z.array(BackendSchema) }).meta({ id: 'BackendsResponseDto' });

const BackendResponseSchema = z.object({ backend: BackendSchema }).meta({ id: 'BackendResponseDto' });

const CreateLocalBackendRequestSchema = z.object({ path: z.string() }).meta({ id: 'CreateLocalBackendRequestDto' });

export class BackendDto extends createZodDto(BackendSchema) {}
export class BackendsResponseDto extends createZodDto(BackendsResponseSchema) {}
export class BackendResponseDto extends createZodDto(BackendResponseSchema) {}
export class CreateLocalBackendRequestDto extends createZodDto(CreateLocalBackendRequestSchema) {}
