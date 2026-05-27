import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
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

export class UserGetResponseDto {
  @ApiProperty()
  user!: UserDto;
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
