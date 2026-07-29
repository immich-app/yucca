import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { MetaResponseDto } from 'src/dto/meta.dto';
import { MetaService } from 'src/services/meta.service';

@Controller('/meta')
export class MetaController {
  constructor(private readonly meta: MetaService) {}

  @Get()
  @ApiOkResponse({ type: MetaResponseDto })
  getMeta(): Promise<MetaResponseDto> {
    return this.meta.getMeta();
  }
}
