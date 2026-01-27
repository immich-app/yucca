import { ApiProperty } from '@nestjs/swagger';

export class OidcAuthorizeDto {
  @ApiProperty()
  redirectTo!: string;
}

export class AuthDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  sessionId!: string;
}
