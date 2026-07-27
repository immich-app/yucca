import { ApiProperty } from '@nestjs/swagger';

export class ConsumerAdminDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty({ description: 'immich | fubar | restic' })
  type!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: 'string' })
  createdAt!: Date;

  @ApiProperty({ type: 'string', required: false, nullable: true })
  lastSeenAt!: Date | null;
}

export class ConsumerListResponseDto {
  @ApiProperty({ type: [ConsumerAdminDto] })
  consumers!: ConsumerAdminDto[];
}
