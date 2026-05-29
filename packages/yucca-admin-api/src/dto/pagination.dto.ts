import { ApiProperty } from '@nestjs/swagger';
import { IsNumberString, IsOptional, IsUUID } from 'class-validator';

export const DEFAULT_PAGE_SIZE = 50;

export class CursorPaginationDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  cursor?: string;

  @ApiProperty({ required: false, default: DEFAULT_PAGE_SIZE })
  @IsOptional()
  @IsNumberString()
  limit?: string;
}
