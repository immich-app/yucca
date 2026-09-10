import { ConnectionTypes, isoDatetimeToDate } from '@common/server';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const ConnectionSchema = z
  .object({
    id: z.string(),
    type: z.string().meta({ enum: ConnectionTypes }),
    name: z.string(),
    createdAt: isoDatetimeToDate,
    lastSeenAt: isoDatetimeToDate.nullable(),
    repositoryCount: z.number(),
    sizeBytes: z.number().describe('Rolled-up storage across this connection’s repositories (RGW size).'),
    objectCount: z.number().describe('Rolled-up object count across this connection’s repositories.'),
    billableBytes: z.number().describe('Billed bytes: per-object min-size floor applied (immich exempt).'),
  })
  .meta({ id: 'ConnectionDto' });

const ConnectionListResponseSchema = z
  .object({ connections: z.array(ConnectionSchema) })
  .meta({ id: 'ConnectionListResponseDto' });

const ConnectionCreateRequestSchema = z
  .object({
    type: z.enum(ConnectionTypes),
    name: z.string().max(120),
  })
  .meta({ id: 'ConnectionCreateRequestDto' });

const ConnectionUpdateRequestSchema = z
  .object({ name: z.string().max(120) })
  .meta({ id: 'ConnectionUpdateRequestDto' });

const ConnectionResponseSchema = z.object({ connection: ConnectionSchema }).meta({ id: 'ConnectionResponseDto' });

const ConnectionAdoptRequestSchema = z
  .object({
    repositoryIds: z
      .array(z.uuid())
      .nonempty()
      .describe('Repositories to move from the default connection to this one'),
  })
  .meta({ id: 'ConnectionAdoptRequestDto' });

export class ConnectionDto extends createZodDto(ConnectionSchema) {}
export class ConnectionListResponseDto extends createZodDto(ConnectionListResponseSchema, { codec: true }) {}
export class ConnectionCreateRequestDto extends createZodDto(ConnectionCreateRequestSchema) {}
export class ConnectionUpdateRequestDto extends createZodDto(ConnectionUpdateRequestSchema) {}
export class ConnectionResponseDto extends createZodDto(ConnectionResponseSchema) {}
export class ConnectionAdoptRequestDto extends createZodDto(ConnectionAdoptRequestSchema) {}
