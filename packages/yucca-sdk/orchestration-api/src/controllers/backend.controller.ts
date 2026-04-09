import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { BackendsResponseDto } from '../dto/backend.dto';
import { BackendService } from '../services/backend.service';

@Controller('/yucca/backend')
export class BackendController {
  constructor(private readonly service: BackendService) {}

  @Get()
  @ApiOkResponse({ type: BackendsResponseDto })
  getBackends(): Promise<BackendsResponseDto> {
    return this.service.getBackends();
  }
}
