import { isoDatetimeToDate } from '@common/server';
import { createZodDto } from 'nestjs-zod';
import { CursorPaginationSchema } from 'src/dto/pagination.dto';
import { z } from 'zod';

const UserSchema = z
  .object({
    id: z.string(),
    sub: z.string(),
    name: z.string(),
    email: z.string(),
    disabled: z.boolean(),
  })
  .meta({ id: 'UserDto' });

const UserListQuerySchema = z.object(CursorPaginationSchema.shape).meta({ id: 'UserListQueryDto' });

const UserListResponseSchema = z
  .object({
    items: z.array(UserSchema),
    nextCursor: z.string().nullable(),
  })
  .meta({ id: 'UserListResponseDto' });

const UserDiscordLinkSchema = z
  .object({
    discordUserId: z.string(),
    discordUsername: z.string(),
    createdAt: isoDatetimeToDate,
  })
  .meta({ id: 'UserDiscordLinkDto' });

const UserGetResponseSchema = z
  .object({
    user: UserSchema,
    discordLink: UserDiscordLinkSchema.nullable(),
  })
  .meta({ id: 'UserGetResponseDto' });

const UserDiscordLinkRequestSchema = z
  .object({
    discordUserId: z.string().max(64),
    discordUsername: z.string().max(120).optional(),
  })
  .meta({ id: 'UserDiscordLinkRequestDto' });

const UserUpdateRequestSchema = z.object({ disabled: z.boolean().optional() }).meta({ id: 'UserUpdateRequestDto' });

const UserUpdateResponseSchema = z.object({ user: UserSchema }).meta({ id: 'UserUpdateResponseDto' });

export class UserDto extends createZodDto(UserSchema) {}
export class UserListQueryDto extends createZodDto(UserListQuerySchema) {}
export class UserListResponseDto extends createZodDto(UserListResponseSchema) {}
export class UserDiscordLinkDto extends createZodDto(UserDiscordLinkSchema) {}
export class UserGetResponseDto extends createZodDto(UserGetResponseSchema) {}
export class UserDiscordLinkRequestDto extends createZodDto(UserDiscordLinkRequestSchema) {}
export class UserUpdateRequestDto extends createZodDto(UserUpdateRequestSchema) {}
export class UserUpdateResponseDto extends createZodDto(UserUpdateResponseSchema) {}
