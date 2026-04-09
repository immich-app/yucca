import { Controller, Param, Sse } from '@nestjs/common';
import { ApiParam } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { RunHistoryRepository } from '../repositories/runHistory.repository';

@Controller('/yucca/logs')
export class RunHistoryController {
  constructor(private readonly repository: RunHistoryRepository) {}

  @Sse('/:id')
  @ApiParam({ name: 'id', type: String })
  logStreamSse(@Param('id') id: string): Observable<MessageEvent> {
    return this.repository.getObservable(id);
  }
}
