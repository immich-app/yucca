import { Inject, Injectable } from '@nestjs/common';
import { CurrentRecoveryKeyResponse, OnboardingStatusResponseDto } from '../dto/onboarding.dto';
import { type ModuleConfig, ModuleConfigProvider } from '../moduleConfig';
import { BackendRepository } from '../repositories/backend.repository';
import { ConfigRepository } from '../repositories/config.repository';

@Injectable()
export class OnboardingService {
  constructor(
    private readonly backend: BackendRepository,
    private readonly config: ConfigRepository,
    @Inject(ModuleConfigProvider) private readonly moduleConfig: ModuleConfig,
  ) {}

  async onboardingStatus(): Promise<OnboardingStatusResponseDto> {
    const backends = await this.backend.getBackends();

    return {
      hasOnboardedKey: await this.config.hasOnboardedKey(),
      hasBackend: backends.length > 0,
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
}
