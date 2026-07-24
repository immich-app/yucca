import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class AuthDto {
  @ApiProperty()
  sub!: string;
}

export class CliTokenRequestDto {
  @ApiProperty({ description: 'One-time code delivered to the loopback redirect' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({ description: 'Plaintext verifier whose S256 hash was sent as code_challenge on /auth/cli/login' })
  @IsString()
  @IsNotEmpty()
  codeVerifier!: string;
}

export class CliTokenResponseDto {
  @ApiProperty({ description: 'ES256 session JWT for Authorization: Bearer' })
  accessToken!: string;

  @ApiProperty({ description: 'Session expiry, ISO 8601' })
  expiresAt!: string;

  @ApiProperty()
  sub!: string;
}
