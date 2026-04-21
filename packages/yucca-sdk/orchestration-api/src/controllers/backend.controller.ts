import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { BackendResponseDto, BackendsResponseDto, CreateLocalBackendRequestDto } from '../dto/backend.dto';
import { BackendService } from '../services/backend.service';

@Controller('/yucca/backend')
export class BackendController {
  constructor(private readonly service: BackendService) {}

  @Get()
  @ApiOkResponse({ type: BackendsResponseDto })
  getBackends(): Promise<BackendsResponseDto> {
    return this.service.getBackends();
  }

  @Post('local')
  @ApiOkResponse({ type: BackendResponseDto })
  createLocalBackend(@Body() dto: CreateLocalBackendRequestDto): Promise<BackendResponseDto> {
    return this.service.createLocalBackend(dto);
  }
}
