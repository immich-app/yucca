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
}

export class AppTokenRequestDto {
  @ApiProperty()
  codeVerifier!: string;
  @ApiProperty()
  code!: string;
}

export class AppTokenResponseDto {
  @ApiProperty()
  accessToken!: string;
}
