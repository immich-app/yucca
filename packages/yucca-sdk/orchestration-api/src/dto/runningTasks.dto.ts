import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { TaskStatus, TaskType } from '../enum';

export const TaskStatusSchema = z.enum(TaskStatus).meta({ id: 'TaskStatus' });
export const TaskTypeSchema = z.enum(TaskType).meta({ id: 'TaskType' });

const ActiveScheduleItemSchema = z
  .object({
    repositoryId: z.string(),
    status: TaskStatusSchema,
  })
  .meta({ id: 'ActiveScheduleItemDto' });

const RunningTaskSchema = z
  .object({
    parentId: z.string(),
    type: TaskTypeSchema,
    logId: z.string().optional(),
    scheduleStatus: z.array(ActiveScheduleItemSchema).optional(),
  })
  .meta({ id: 'RunningTaskDto' });

const RunningTaskListResponseSchema = z
  .object({ tasks: z.array(RunningTaskSchema) })
  .meta({ id: 'RunningTaskListResponse' });

export class ActiveScheduleItemDto extends createZodDto(ActiveScheduleItemSchema) {}
export class RunningTaskDto extends createZodDto(RunningTaskSchema) {}
export class RunningTaskListResponse extends createZodDto(RunningTaskListResponseSchema) {}
