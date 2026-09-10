import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const AuthSchema = z.object({ sub: z.string() }).meta({ id: 'AuthDto' });

const CliTokenRequestSchema = z
  .object({
    code: z.string().min(1).describe('One-time code delivered to the loopback redirect'),
    codeVerifier: z
      .string()
      .min(1)
      .describe('Plaintext verifier whose S256 hash was sent as code_challenge on /auth/cli/login'),
  })
  .meta({ id: 'CliTokenRequestDto' });

const CliTokenResponseSchema = z
  .object({
    accessToken: z.string().describe('ES256 session JWT for Authorization: Bearer'),
    expiresAt: z.string().describe('Session expiry, ISO 8601'),
    sub: z.string(),
  })
  .meta({ id: 'CliTokenResponseDto' });

export class AuthDto extends createZodDto(AuthSchema) {}
export class CliTokenRequestDto extends createZodDto(CliTokenRequestSchema) {}
export class CliTokenResponseDto extends createZodDto(CliTokenResponseSchema) {}
