import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { CronJob } from 'cron';

@ValidatorConstraint({ name: 'cronValidator' })
class CronValidator implements ValidatorConstraintInterface {
  validate(expression: string): boolean {
    try {
      new CronJob(expression, () => {});
      return true;
    } catch {
      return false;
    }
  }
}

const IsCronExpression = () => Validate(CronValidator, { message: 'Invalid cron expression' });

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
  @IsString()
  name!: string;

  @ApiProperty({ type: String })
  @IsString()
  @IsCronExpression()
  cron!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  repositories!: string[];
}

export class ScheduleCreateResponseDto {
  @ApiProperty({ type: ScheduleDto })
  schedule!: ScheduleDto;
}

export class ScheduleUpdateRequestDto {
  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ type: Boolean, required: false })
  @IsOptional()
  @IsBoolean()
  paused?: boolean;

  @ApiProperty({ type: String, required: false })
  @IsOptional()
  @IsString()
  @IsCronExpression()
  cron?: string;

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  repositories?: string[];
}

export class ScheduleUpdateResponseDto {
  @ApiProperty({ type: ScheduleDto })
  schedule!: ScheduleDto;
}

export class ScheduleListResponseDto {
  @ApiProperty({ type: [ScheduleDto] })
  schedules!: ScheduleDto[];
}
