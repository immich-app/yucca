import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { CursorPaginationDto } from 'src/dto/pagination.dto';

export class UserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  sub!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  disabled!: boolean;
}

export class UserListQueryDto extends CursorPaginationDto {}

export class UserListResponseDto {
  @ApiProperty({ type: [UserDto] })
  items!: UserDto[];

  @ApiProperty({ required: false, nullable: true })
  nextCursor!: string | null;
}

export class UserDiscordLinkDto {
  @ApiProperty()
  discordUserId!: string;

  @ApiProperty()
  discordUsername!: string;

  @ApiProperty({ type: 'string' })
  createdAt!: Date;
}

export class UserGetResponseDto {
  @ApiProperty()
  user!: UserDto;

  @ApiProperty({ type: UserDiscordLinkDto, required: false, nullable: true })
  discordLink!: UserDiscordLinkDto | null;
}

export class UserDiscordLinkRequestDto {
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  discordUserId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  discordUsername?: string;
}

export class UserUpdateRequestDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  disabled?: boolean;
}

export class UserUpdateResponseDto {
  @ApiProperty()
  user!: UserDto;
}
