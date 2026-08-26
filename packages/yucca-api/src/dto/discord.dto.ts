import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

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

export class DiscordUserSummaryDto {
  id!: string;
  name!: string;
  email!: string;
  createdAt!: Date;
  connectionCount!: number;
  repositoryCount!: number;
  lastSeenAt!: Date | null;
}
