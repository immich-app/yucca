import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class DiscordLinkRequestResponseDto {
  @ApiProperty()
  discordUsername!: string;
}

export class DiscordLinkRequestCreateDto {
  @IsString()
  @MaxLength(64)
  discordUserId!: string;

  @IsString()
  @MaxLength(120)
  discordUsername!: string;
}

export class DiscordLinkUsernameUpdateDto {
  @IsString()
  @MaxLength(120)
  discordUsername!: string;
}

export class DiscordLinkRequestCreatedDto {
  code!: string;
  expiresAt!: Date;
}

export class DiscordLinkDto {
  userId!: string;
  discordUserId!: string;
  discordUsername!: string;
  createdAt!: Date;
}

export class DiscordInviteBatchCreateDto {
  @IsString()
  @MaxLength(64)
  guildId!: string;

  @IsString()
  @MaxLength(64)
  channelId!: string;

  @IsInt()
  @Min(1)
  @Max(500)
  maxClaims!: number;

  @IsString()
  @MaxLength(64)
  createdByDiscordUserId!: string;
}

export class DiscordInviteBatchMessageDto {
  @IsString()
  @MaxLength(64)
  messageId!: string;
}

export class DiscordInviteBatchDto {
  id!: string;
  maxClaims!: number;
  claimed!: number;
}

export class DiscordInviteCreateDto {
  @IsString()
  @MaxLength(64)
  discordUserId!: string;

  @IsString()
  @MaxLength(120)
  discordUsername!: string;

  @IsOptional()
  @IsUUID()
  batchId?: string;
}

export class DiscordInviteCreatedDto {
  code!: string;
  expiresAt!: Date;
  remaining!: number | null;
}

export class DiscordInviteResponseDto {
  @ApiProperty()
  discordUsername!: string;
}

export class DiscordUserSummaryDto {
  id!: string;
  name!: string;
  email!: string;
  createdAt!: Date;
  connectionCount!: number;
  repositoryCount!: number;
  lastSeenAt!: Date | null;
}
