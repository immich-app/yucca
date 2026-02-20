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
  sub!: string;
  @ApiProperty()
  access_token!: string;
}

export class AppTokenResponseDto {
  @ApiProperty()
  accessToken!: string;
}
