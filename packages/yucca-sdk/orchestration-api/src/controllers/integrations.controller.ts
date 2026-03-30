import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { IntegrationsResponseDto } from '../dto/integrations.dto';

import { IntegrationsService } from '../services/integrations.service';

@Controller('/yucca/integrations')
export class IntegrationsController {
  constructor(private readonly service: IntegrationsService) {}

  @Get()
  @ApiOkResponse({ type: IntegrationsResponseDto })
  getIntegrations(): IntegrationsResponseDto {
    return this.service.getIntegrationsConfig();
  }
}
