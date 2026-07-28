import { ApiProperty } from '@nestjs/swagger';

export class AuthDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  sessionId!: string;

  // The connection instance bound to this session (device-flow logins); null
  // for web sessions and sessions predating the connection model.
  @ApiProperty({ type: 'string', required: false, nullable: true })
  connectionId!: string | null;

  // Resolved feature flags: per-user override, else registry default.
  @ApiProperty({ type: 'object', additionalProperties: { type: 'boolean' } })
  features!: Record<string, boolean>;
}
