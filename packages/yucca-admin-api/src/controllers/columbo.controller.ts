import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { ColumboInvestigateRequestDto, ColumboInvestigationDto } from 'src/dto/columbo.dto';
import { AuthRoute } from 'src/middleware/auth.guard';
import { ColumboService } from 'src/services/columbo.service';

@Controller('/columbo')
export class ColumboController {
  constructor(private readonly columbo: ColumboService) {}

  @Post('/investigations')
  @AuthRoute()
  @ApiOkResponse({ type: ColumboInvestigationDto })
  startInvestigation(@Body() dto: ColumboInvestigateRequestDto): Promise<ColumboInvestigationDto> {
    return this.columbo.startInvestigation(dto);
  }

  @Get('/investigations/:id')
  @AuthRoute()
  @ApiOkResponse({ type: ColumboInvestigationDto })
  getInvestigation(@Param('id') id: string): Promise<ColumboInvestigationDto> {
    return this.columbo.getInvestigation(id);
  }
}
