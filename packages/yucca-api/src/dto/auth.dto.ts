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

  // The consumer instance bound to this session (device-flow logins); null
  // for web sessions and sessions predating the consumer model.
  @ApiProperty({ required: false, nullable: true })
  consumerId!: string | null;

  // Resolved feature flags: per-user override, else registry default.
  @ApiProperty({ type: 'object', additionalProperties: { type: 'boolean' } })
  features!: Record<string, boolean>;
}
