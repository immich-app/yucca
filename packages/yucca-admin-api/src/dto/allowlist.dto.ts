import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsBoolean, IsEmail, IsInt, IsOptional, Max, Min } from 'class-validator';
import { CursorPaginationDto } from 'src/dto/pagination.dto';

export class AllowlistEntryDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  inviteCode!: string;

  @ApiProperty()
  invited!: boolean;

  @ApiProperty()
  inviteUsed!: boolean;

  @ApiProperty({ type: 'string', required: false, nullable: true })
  inviteUsedAt!: Date | null;

  @ApiProperty({ type: 'string' })
  createdAt!: Date;
}

export class AllowlistListQueryDto extends CursorPaginationDto {}

export class AllowlistListResponseDto {
  @ApiProperty({ type: [AllowlistEntryDto] })
  items!: AllowlistEntryDto[];

  @ApiProperty({ required: false, nullable: true })
  nextCursor!: string | null;
}

export class AllowlistAddRequestDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({ required: false, description: 'Stage the entry without allowing login yet' })
  @IsOptional()
  @IsBoolean()
  staged?: boolean;
}

export class AllowlistInviteRequestDto {
  @ApiProperty({ type: [String] })
  @ArrayNotEmpty()
  @IsEmail({}, { each: true })
  emails!: string[];
}

export class AllowlistInviteBatchRequestDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(500)
  count!: number;
}

export class AllowlistEntryResponseDto {
  @ApiProperty()
  entry!: AllowlistEntryDto;
}

export class AllowlistEntriesResponseDto {
  @ApiProperty({ type: [AllowlistEntryDto] })
  items!: AllowlistEntryDto[];
}
