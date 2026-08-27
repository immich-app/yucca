import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

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

export class DiscordTicketCreateDto {
  @IsString()
  @MaxLength(64)
  threadId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  staffThreadId?: string;

  @IsString()
  @MaxLength(64)
  freshdeskTicketId!: string;

  @IsString()
  @MaxLength(64)
  discordUserId!: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  lastMirroredMessageId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  lastStaffMirroredMessageId?: string;
}

export class DiscordTicketUpdateDto {
  @IsOptional()
  @IsBoolean()
  emailSubscribed?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  lastMirroredMessageId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  lastStaffMirroredMessageId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  lastFreshdeskConversationId?: string;

  @IsOptional()
  @IsBoolean()
  closed?: boolean;
}

export class DiscordTicketDto {
  id!: string;
  threadId!: string;
  staffThreadId!: string | null;
  freshdeskTicketId!: string;
  discordUserId!: string;
  userId!: string | null;
  emailSubscribed!: boolean;
  lastMirroredMessageId!: string | null;
  lastStaffMirroredMessageId!: string | null;
  lastFreshdeskConversationId!: string | null;
  closedAt!: Date | null;
  createdAt!: Date;
}

export class DiscordTicketListDto {
  items!: DiscordTicketDto[];
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
