import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import {
  ConfigureImmichIntegrationRequestDto,
  ConfigureImmichIntegrationResponseDto,
  ImmichBackupStatusDto,
  ImmichRollbackRequestDto,
  IntegrationsResponseDto,
} from '../dto/integrations.dto';

import { type Response } from 'express';
import { ImmichCookie } from '../enum';
import { IntegrationsService } from '../services/integrations.service';

@Controller('/yucca/integrations')
export class IntegrationsController {
  constructor(private readonly service: IntegrationsService) {}

  @Get()
  @ApiOkResponse({ type: IntegrationsResponseDto })
  getIntegrations(): Promise<IntegrationsResponseDto> {
    return this.service.getIntegrationsConfig();
  }

  @Get('immich/status')
  @ApiOkResponse({ type: ImmichBackupStatusDto })
  getImmichBackupStatus(): Promise<ImmichBackupStatusDto> {
    return this.service.getImmichBackupStatus();
  }

  @Post('immich')
  @ApiOkResponse({ type: ConfigureImmichIntegrationResponseDto })
  configureImmichIntegration(
    @Body() dto: ConfigureImmichIntegrationRequestDto,
  ): Promise<ConfigureImmichIntegrationResponseDto> {
    return this.service.configureImmichIntegration(dto);
  }

  @Post('immich/rollback')
  async startImmichRollback(@Body() dto: ImmichRollbackRequestDto, @Res({ passthrough: true }) response: Response) {
    const { jwt } = await this.service.enterImmichMaintenanceRollback(dto);
    response.cookie(ImmichCookie.MaintenanceToken, jwt);
  }
}
