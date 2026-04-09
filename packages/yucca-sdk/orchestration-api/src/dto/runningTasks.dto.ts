import { ApiProperty } from '@nestjs/swagger';
import { TaskStatus, TaskType } from '../enum';

export class ActiveScheduleItemDto {
  @ApiProperty({ type: String })
  repositoryId!: string;

  @ApiProperty({ enumName: 'TaskStatus', enum: TaskStatus })
  status!: TaskStatus;
}

export class RunningTaskDto {
  @ApiProperty({ type: String })
  parentId!: string;

  @ApiProperty({ enumName: 'TaskType', enum: TaskType })
  type!: TaskType;

  @ApiProperty({ type: String, required: false })
  logId?: string;

  @ApiProperty({ type: [ActiveScheduleItemDto], required: false })
  scheduleStatus?: ActiveScheduleItemDto[];
}

export class RunningTaskListResponse {
  @ApiProperty({ type: [RunningTaskDto] })
  tasks!: RunningTaskDto[];
}
