import { ApiProperty } from '@nestjs/swagger';

export class ConnectionAdminDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty({ description: 'immich | restic' })
  type!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: 'string' })
  createdAt!: Date;

  @ApiProperty({ type: 'string', required: false, nullable: true })
  lastSeenAt!: Date | null;
}

export class ConnectionListResponseDto {
  @ApiProperty({ type: [ConnectionAdminDto] })
  connections!: ConnectionAdminDto[];
}
