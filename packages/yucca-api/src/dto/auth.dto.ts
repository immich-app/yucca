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

  @ApiProperty({ type: 'object', additionalProperties: { type: 'boolean' } })
  features!: Record<string, boolean>;
}
