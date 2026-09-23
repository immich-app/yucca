import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { ConfigResponseDto, ConfigUpdateRequestDto } from '../dto/config.dto';
import { ConfigService } from '../services/config.service';

@Controller('/yucca/config')
export class ConfigController {
  constructor(private readonly service: ConfigService) {}

  @Get()
  @ApiOkResponse({ type: ConfigResponseDto })
  getConfig(): ConfigResponseDto {
    return this.service.getConfig();
  }

  @Put()
  @ApiOkResponse({ type: ConfigResponseDto })
  updateConfig(@Body() dto: ConfigUpdateRequestDto): Promise<ConfigResponseDto> {
    return this.service.updateConfig(dto);
  }
}
