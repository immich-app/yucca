import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class FeatureFlagDefDto {
  @ApiProperty()
  key!: string;

  @ApiProperty({ description: 'Registry default when no override exists' })
  default!: boolean;

  @ApiProperty({ description: 'experimental | beta | ga | retired' })
  stage!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  since!: string;

  @ApiProperty({ description: 'Number of users with an override for this flag' })
  overrides!: number;
}

export class FeatureFlagListResponseDto {
  @ApiProperty({ type: [FeatureFlagDefDto] })
  flags!: FeatureFlagDefDto[];
}

export class FeatureOverrideDto {
  @ApiProperty()
  flag!: string;

  @ApiProperty()
  value!: boolean;

  @ApiProperty()
  setBy!: string;

  @ApiProperty({ required: false, nullable: true })
  reason!: string | null;

  @ApiProperty({ type: 'string' })
  updatedAt!: Date;
}

export class UserFeaturesResponseDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'boolean' },
    description: 'Resolved flags: override, else registry default',
  })
  features!: Record<string, boolean>;

  @ApiProperty({ type: [FeatureOverrideDto] })
  overrides!: FeatureOverrideDto[];
}

export class FeatureOverrideSetRequestDto {
  @ApiProperty()
  @IsBoolean()
  value!: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class FeatureEnableBatchRequestDto {
  @ApiProperty({ description: 'Enable for this many not-yet-overridden users, oldest first' })
  @IsInt()
  @Min(1)
  @Max(500)
  count!: number;
}

export class FeatureUserDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  value!: boolean;

  @ApiProperty()
  setBy!: string;

  @ApiProperty({ required: false, nullable: true })
  reason!: string | null;

  @ApiProperty({ type: 'string' })
  updatedAt!: Date;
}

export class FeatureUsersResponseDto {
  @ApiProperty({ type: [FeatureUserDto] })
  items!: FeatureUserDto[];
}

export class FeatureEnableBatchResponseDto {
  @ApiProperty({ type: [FeatureUserDto] })
  enabled!: FeatureUserDto[];
}
