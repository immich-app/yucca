import { isoDatetimeToDate } from '@common/server';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const ConnectionAdminSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    type: z.string().describe('immich | restic'),
    name: z.string(),
    createdAt: isoDatetimeToDate,
    lastSeenAt: isoDatetimeToDate.nullable(),
  })
  .meta({ id: 'ConnectionAdminDto' });

const ConnectionListResponseSchema = z
  .object({ connections: z.array(ConnectionAdminSchema) })
  .meta({ id: 'ConnectionListResponseDto' });

export class ConnectionAdminDto extends createZodDto(ConnectionAdminSchema) {}
export class ConnectionListResponseDto extends createZodDto(ConnectionListResponseSchema) {}
