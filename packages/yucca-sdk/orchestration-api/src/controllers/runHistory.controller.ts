import { Controller, Get, Param, Sse } from '@nestjs/common';
import { ApiOkResponse, ApiParam } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { RunResponseDto } from '../dto/repository.dto';
import { RunHistoryRepository } from '../repositories/runHistory.repository';

@Controller('/yucca/logs')
export class RunHistoryController {
  constructor(private readonly repository: RunHistoryRepository) {}

  @Get('/:id')
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({ type: RunResponseDto })
  async getRun(@Param('id') id: string): Promise<RunResponseDto> {
    return { run: await this.repository.get(id) };
  }

  @Sse('/:id/stream')
  @ApiParam({ name: 'id', type: String })
  logStreamSse(@Param('id') id: string): Observable<MessageEvent> {
    return this.repository.getObservable(id);
  }
}
