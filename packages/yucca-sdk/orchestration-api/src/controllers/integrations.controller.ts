import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import {
  ConfigureImmichIntegrationRequestDto,
  ImmichRollbackRequestDto,
  IntegrationsResponseDto,
} from '../dto/integrations.dto';

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
  startImmichRollback(@Body() dto: ImmichRollbackRequestDto) {
    return this.service.enterImmichMaintenanceRollback(dto);
  }
}
