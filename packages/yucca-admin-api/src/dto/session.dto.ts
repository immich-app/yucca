import { ApiProperty } from '@nestjs/swagger';

export class SessionDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;
}

export class SessionListResponseDto {
  @ApiProperty({ type: [SessionDto] })
  items!: SessionDto[];
}
