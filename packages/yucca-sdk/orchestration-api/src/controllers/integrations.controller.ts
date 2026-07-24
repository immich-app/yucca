import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import {
  ConfigureImmichIntegrationRequestDto,
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

  @Post('immich')
  configureImmichIntegration(@Body() dto: ConfigureImmichIntegrationRequestDto) {
    return this.service.configureImmichIntegration(dto);
  }

  @Post('immich/rollback')
  async startImmichRollback(@Body() dto: ImmichRollbackRequestDto, @Res({ passthrough: true }) response: Response) {
    const { jwt } = await this.service.enterImmichMaintenanceRollback(dto);
    response.cookie(ImmichCookie.MaintenanceToken, jwt);
  }
}
