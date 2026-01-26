import { ApiProperty } from '@nestjs/swagger';

export class OidcAuthorizeDto {
  @ApiProperty()
  redirectTo!: string;
}

export class AuthDto {
  @ApiProperty()
  sessionId!: string;

  @ApiProperty()
  userId!: string;
}
