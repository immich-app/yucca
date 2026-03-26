import { Injectable } from '@nestjs/common';
import { CurrentRecoveryKeyResponse, OnboardingStatusResponseDto } from '../dto/onboarding.dto';
import { BackendRepository } from '../repositories/backend.repository';
import { ConfigRepository } from '../repositories/config.repository';
import { RepositoryRepository } from '../repositories/repository.repository';
import { ScheduleRepository } from '../repositories/schedule.repository';

@Injectable()
export class OnboardingService {
  constructor(
    private readonly backend: BackendRepository,
    private readonly repository: RepositoryRepository,
    private readonly schedule: ScheduleRepository,
    private readonly config: ConfigRepository,
  ) {}

  async onboardingStatus(): Promise<OnboardingStatusResponseDto> {
    const backends = await this.backend.getBackends();
    const repositories = await this.repository.getAll();
    const schedules = await this.schedule.getAll();

    return {
      hasOnboardedKey: await this.config.hasOnboardedKey(),
      hasBackend: backends.length > 0,
      hasBackup: repositories.length > 0,
      hasSchedule: schedules.length > 0,
      hasSkippedExtraConfig: await this.config.hasSkippedExtraConfig(),
    };
  }

  async currentRecoveryKey(): Promise<CurrentRecoveryKeyResponse> {
    const recoveryKey = await this.config.getMasterEncryptionKey();

    return {
      recoveryKey,
    };
  }

  async importRecoveryKey(key: string) {
    await this.config.importEncryptionKey(key);
  }

  async confirmRecoveryKey() {
    await this.config.confirmKeyOnboarded();
  }

  async skipExtraConfig() {
    await this.config.skipExtraConfig();
  }
}
