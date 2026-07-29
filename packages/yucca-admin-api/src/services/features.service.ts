import { featureFlagByKey, featureFlagDefs, resolveFeatures } from '@common/server';
import { LoggerRepository, WideContextRepository } from '@common/server/otel';
import { BadRequestException, Injectable } from '@nestjs/common';
import { AuthDto } from 'src/dto/auth.dto';
import {
  FeatureEnableBatchRequestDto,
  FeatureEnableBatchResponseDto,
  FeatureFlagListResponseDto,
  FeatureOverrideSetRequestDto,
  FeatureUsersResponseDto,
  UserFeaturesResponseDto,
} from 'src/dto/features.dto';
import { FeatureFlagRepository } from 'src/repositories/featureFlag.repository';

@Injectable()
export class FeaturesService {
  constructor(
    private readonly logger: LoggerRepository,
    private readonly wideContext: WideContextRepository,
    private readonly featureFlags: FeatureFlagRepository,
  ) {}

  async list(): Promise<FeatureFlagListResponseDto> {
    const countRows = await this.featureFlags.countsByFlag();
    const counts = new Map(countRows.map((row) => [row.flag, Number(row.count)]));
    return {
      flags: featureFlagDefs().map((def) => ({ ...def, overrides: counts.get(def.key) ?? 0 })),
    };
  }

  async getForUser(userId: string): Promise<UserFeaturesResponseDto> {
    const overrides = await this.featureFlags.getByUser(userId);
    return {
      features: resolveFeatures(overrides),
      overrides,
    };
  }

  private assertKnownFlag(flag: string) {
    if (!featureFlagByKey(flag)) {
      throw new BadRequestException(`Unknown feature flag '${flag}'`);
    }
  }

  async set(auth: AuthDto, userId: string, flag: string, dto: FeatureOverrideSetRequestDto) {
    this.assertKnownFlag(flag);
    const override = await this.featureFlags.upsert(userId, flag, dto.value, auth.sub, dto.reason);
    this.wideContext.assignContext({ featureFlag: { flag, userId, value: dto.value, setBy: auth.sub } });
    this.logger.info(`Feature '${flag}' set to ${dto.value} for user ${userId} by ${auth.sub}`);
    return override;
  }

  async clear(auth: AuthDto, userId: string, flag: string): Promise<void> {
    this.assertKnownFlag(flag);
    await this.featureFlags.delete(userId, flag);
    this.logger.info(`Feature '${flag}' override cleared for user ${userId} by ${auth.sub}`);
  }

  async listUsers(flag: string): Promise<FeatureUsersResponseDto> {
    this.assertKnownFlag(flag);
    return { items: await this.featureFlags.listByFlag(flag) };
  }

  async enableBatch(
    auth: AuthDto,
    flag: string,
    dto: FeatureEnableBatchRequestDto,
  ): Promise<FeatureEnableBatchResponseDto> {
    this.assertKnownFlag(flag);
    const users = await this.featureFlags.usersWithoutOverride(flag, dto.count);

    const enabled = [];
    for (const user of users) {
      const override = await this.featureFlags.upsert(user.id, flag, true, auth.sub, 'enable-batch');
      enabled.push({
        userId: user.id,
        email: user.email,
        value: override.value,
        setBy: override.setBy,
        reason: override.reason,
        updatedAt: override.updatedAt,
      });
    }

    this.logger.info(`Feature '${flag}' batch-enabled for ${enabled.length} users by ${auth.sub}`);
    return { enabled };
  }
}
