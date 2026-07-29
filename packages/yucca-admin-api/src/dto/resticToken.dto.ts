import { ApiProperty } from '@nestjs/swagger';
import { IsBooleanString, IsOptional, IsUUID } from 'class-validator';
import { CursorPaginationDto } from 'src/dto/pagination.dto';

export class ResticTokenDto {
  @ApiProperty()
  jti!: string;

  @ApiProperty()
  repositoryId!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty({ type: 'string', required: false, nullable: true })
  connectionId!: string | null;

  @ApiProperty({ description: "'user' or 'admin'" })
  mintedBy!: string;

  @ApiProperty({ type: 'string', required: false, nullable: true })
  label!: string | null;

  @ApiProperty({ type: 'string' })
  expiresAt!: Date;

  @ApiProperty({ type: 'string', required: false, nullable: true })
  revokedAt!: Date | null;

  @ApiProperty({ type: 'string', required: false, nullable: true })
  revokedBy!: string | null;

  @ApiProperty({ type: 'string' })
  createdAt!: Date;
}

export class ResticTokenListQueryDto extends CursorPaginationDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  repositoryId?: string;

  @ApiProperty({ required: false, description: 'true = only unexpired, unrevoked tokens' })
  @IsOptional()
  @IsBooleanString()
  active?: string;
}

export class ResticTokenListResponseDto {
  @ApiProperty({ type: [ResticTokenDto] })
  items!: ResticTokenDto[];

  @ApiProperty({ required: false, nullable: true })
  nextCursor!: string | null;
}
