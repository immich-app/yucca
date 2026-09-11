import { CronJob } from 'cron';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const isCronExpression = (expression: string): boolean => {
  try {
    new CronJob(expression, () => {});
    return true;
  } catch {
    return false;
  }
};

const CronExpressionSchema = z.string().refine(isCronExpression, 'Invalid cron expression');

export const ScheduleSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    paused: z.boolean(),
    cron: z.string(),
    repositories: z.array(z.string()),
    lastRun: z.string().optional(),
    lastFinished: z.string().optional(),
  })
  .meta({ id: 'ScheduleDto' });

const ScheduleCreateRequestSchema = z
  .object({
    name: z.string(),
    cron: CronExpressionSchema,
    repositories: z.array(z.string()),
  })
  .meta({ id: 'ScheduleCreateRequestDto' });

const ScheduleCreateResponseSchema = z.object({ schedule: ScheduleSchema }).meta({ id: 'ScheduleCreateResponseDto' });

const ScheduleUpdateRequestSchema = z
  .object({
    name: z.string().optional(),
    paused: z.boolean().optional(),
    cron: CronExpressionSchema.optional(),
    repositories: z.array(z.string()).optional(),
  })
  .meta({ id: 'ScheduleUpdateRequestDto' });

const ScheduleUpdateResponseSchema = z.object({ schedule: ScheduleSchema }).meta({ id: 'ScheduleUpdateResponseDto' });

const ScheduleListResponseSchema = z
  .object({ schedules: z.array(ScheduleSchema) })
  .meta({ id: 'ScheduleListResponseDto' });

export class ScheduleDto extends createZodDto(ScheduleSchema) {}
export class ScheduleCreateRequestDto extends createZodDto(ScheduleCreateRequestSchema) {}
export class ScheduleCreateResponseDto extends createZodDto(ScheduleCreateResponseSchema) {}
export class ScheduleUpdateRequestDto extends createZodDto(ScheduleUpdateRequestSchema) {}
export class ScheduleUpdateResponseDto extends createZodDto(ScheduleUpdateResponseSchema) {}
export class ScheduleListResponseDto extends createZodDto(ScheduleListResponseSchema) {}
