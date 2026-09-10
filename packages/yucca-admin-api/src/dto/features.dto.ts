import { isoDatetimeToDate } from '@common/server';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const FeatureFlagDefSchema = z
  .object({
    key: z.string(),
    default: z.boolean().describe('Registry default when no override exists'),
    stage: z.string().describe('experimental | beta | ga | retired'),
    description: z.string(),
    since: z.string(),
    overrides: z.number().describe('Number of users with an override for this flag'),
  })
  .meta({ id: 'FeatureFlagDefDto' });

const FeatureFlagListResponseSchema = z
  .object({ flags: z.array(FeatureFlagDefSchema) })
  .meta({ id: 'FeatureFlagListResponseDto' });

const FeatureOverrideSchema = z
  .object({
    flag: z.string(),
    value: z.boolean(),
    setBy: z.string(),
    reason: z.string().nullable(),
    updatedAt: isoDatetimeToDate,
  })
  .meta({ id: 'FeatureOverrideDto' });

const UserFeaturesResponseSchema = z
  .object({
    features: z.record(z.string(), z.boolean()).describe('Resolved flags: override, else registry default'),
    overrides: z.array(FeatureOverrideSchema),
  })
  .meta({ id: 'UserFeaturesResponseDto' });

const FeatureOverrideSetRequestSchema = z
  .object({
    value: z.boolean(),
    reason: z.string().optional(),
  })
  .meta({ id: 'FeatureOverrideSetRequestDto' });

const FeatureEnableBatchRequestSchema = z
  .object({
    count: z.int().min(1).max(500).describe('Enable for this many not-yet-overridden users, oldest first'),
  })
  .meta({ id: 'FeatureEnableBatchRequestDto' });

const FeatureUserSchema = z
  .object({
    userId: z.string(),
    email: z.string(),
    value: z.boolean(),
    setBy: z.string(),
    reason: z.string().nullable(),
    updatedAt: isoDatetimeToDate,
  })
  .meta({ id: 'FeatureUserDto' });

const FeatureUsersResponseSchema = z
  .object({ items: z.array(FeatureUserSchema) })
  .meta({ id: 'FeatureUsersResponseDto' });

const FeatureEnableBatchResponseSchema = z
  .object({ enabled: z.array(FeatureUserSchema) })
  .meta({ id: 'FeatureEnableBatchResponseDto' });

export class FeatureFlagDefDto extends createZodDto(FeatureFlagDefSchema) {}
export class FeatureFlagListResponseDto extends createZodDto(FeatureFlagListResponseSchema) {}
export class FeatureOverrideDto extends createZodDto(FeatureOverrideSchema) {}
export class UserFeaturesResponseDto extends createZodDto(UserFeaturesResponseSchema) {}
export class FeatureOverrideSetRequestDto extends createZodDto(FeatureOverrideSetRequestSchema) {}
export class FeatureEnableBatchRequestDto extends createZodDto(FeatureEnableBatchRequestSchema) {}
export class FeatureUserDto extends createZodDto(FeatureUserSchema) {}
export class FeatureUsersResponseDto extends createZodDto(FeatureUsersResponseSchema) {}
export class FeatureEnableBatchResponseDto extends createZodDto(FeatureEnableBatchResponseSchema) {}
