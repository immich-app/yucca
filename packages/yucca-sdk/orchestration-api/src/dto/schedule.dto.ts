import { ApiProperty } from '@nestjs/swagger';

export class ScheduleDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: Boolean })
  paused!: boolean;

  @ApiProperty({ type: String })
  cron!: string;

  @ApiProperty({ type: [String] })
  repositories!: string[];

  @ApiProperty({ type: String, required: false })
  lastRun?: string;

  @ApiProperty({ type: String, required: false })
  lastFinished?: string;
}

export class ScheduleCreateRequestDto {
  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: String })
  cron!: string;

  @ApiProperty({ type: [String] })
  repositories!: string[];
}

export class ScheduleCreateResponseDto {
  @ApiProperty({ type: ScheduleDto })
  schedule!: ScheduleDto;
}

export class ScheduleListResponseDto {
  @ApiProperty({ type: [ScheduleDto] })
  schedules!: ScheduleDto[];
}
