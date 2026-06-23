import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { ApiBody, ApiOkResponse } from '@nestjs/swagger';
import {
  CurrentRecoveryKeyResponse,
  ImportRecoveryKeyRequest,
  OnboardingStatusResponseDto,
} from '../dto/onboarding.dto';
import { OnboardingService } from '../services/onboarding.service';

@Controller('/yucca/onboarding')
export class OnboardingController {
  constructor(readonly service: OnboardingService) {}

  @Get()
  @ApiOkResponse({ type: OnboardingStatusResponseDto })
  async onboardingStatus(): Promise<OnboardingStatusResponseDto> {
    return this.service.onboardingStatus();
  }

  @Get('/recovery-key')
  @ApiOkResponse({ type: CurrentRecoveryKeyResponse })
  async currentRecoveryKey(): Promise<CurrentRecoveryKeyResponse> {
    return this.service.currentRecoveryKey();
  }

  @Put('/recovery-key')
  @ApiBody({ type: ImportRecoveryKeyRequest })
  async importRecoveryKey(@Body() dto: ImportRecoveryKeyRequest) {
    await this.service.importRecoveryKey(dto.recoveryKey);
  }

  @Post('/recovery-key')
  async confirmRecoveryKey() {
    await this.service.confirmRecoveryKey();
  }

  @Post('/skip')
  async skipOnboardingExtraConfig() {
    await this.service.skipExtraConfig();
  }

  @Post('/telemetry')
  async enableTelemetry() {
    await this.service.enableTelemetry();
  }

  @Post('/report-error')
  reportError() {
    this.service.reportError();
  }
}
