import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export class DiscordInviteClaimDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  discordUserId!: string;

  @ApiProperty({ type: 'string', required: false, nullable: true })
  discordUsername!: string | null;

  @ApiProperty({ type: 'string', required: false, nullable: true })
  batchId!: string | null;

  @ApiProperty()
  inviteUsed!: boolean;

  @ApiProperty({ type: 'string', required: false, nullable: true })
  inviteUsedAt!: Date | null;

  @ApiProperty({ type: 'string' })
  createdAt!: Date;
}

export class DiscordInviteClaimListResponseDto {
  @ApiProperty({ type: [DiscordInviteClaimDto] })
  items!: DiscordInviteClaimDto[];
}

export class DiscordInviteBatchDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  guildId!: string;

  @ApiProperty()
  channelId!: string;

  @ApiProperty({ type: 'string', required: false, nullable: true })
  messageId!: string | null;

  @ApiProperty()
  maxClaims!: number;

  @ApiProperty()
  claimed!: number;

  @ApiProperty()
  used!: number;

  @ApiProperty()
  createdByDiscordUserId!: string;

  @ApiProperty({ type: 'string', required: false, nullable: true })
  cancelledAt!: Date | null;

  @ApiProperty({ type: 'string' })
  createdAt!: Date;
}

export class DiscordInviteBatchListResponseDto {
  @ApiProperty({ type: [DiscordInviteBatchDto] })
  items!: DiscordInviteBatchDto[];
}

export class DiscordInviteBatchCancelQueryDto {
  @ApiProperty({ required: false, enum: ['true', 'false'], description: 'Also delete the batch’s unredeemed claims' })
  @IsOptional()
  @IsIn(['true', 'false'])
  revokeUnused?: string;
}

export class DiscordInviteBatchCancelResponseDto {
  @ApiProperty({ type: DiscordInviteBatchDto })
  batch!: DiscordInviteBatchDto;

  @ApiProperty({ description: 'Unredeemed claims deleted by --revoke-unused' })
  revokedClaims!: number;
}
