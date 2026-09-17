import { Controller, Get, NotFoundException, Param, Res, Sse } from '@nestjs/common';
import { ApiOkResponse, ApiParam } from '@nestjs/swagger';
import { type Response } from 'express';
import { Observable } from 'rxjs';
import { RunResponseDto } from '../dto/repository.dto';
import { RunHistoryRepository } from '../repositories/runHistory.repository';
import { StorageRepository } from '../repositories/storage.repository';

@Controller('/yucca/logs')
export class RunHistoryController {
  constructor(
    private readonly repository: RunHistoryRepository,
    private readonly storage: StorageRepository,
  ) {}

  @Get('/:id')
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({ type: RunResponseDto })
  async getRun(@Param('id') id: string): Promise<RunResponseDto> {
    const run = await this.repository.get(id);
    if (!run) {
      throw new NotFoundException('Run not found');
    }

    return { run };
  }

  @Get('/:id/download')
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({ content: { 'application/jsonl': { schema: { type: 'string', format: 'binary' } } } })
  async downloadRunLog(@Param('id') id: string, @Res() response: Response): Promise<void> {
    const run = await this.repository.get(id);
    if (!run) {
      throw new NotFoundException('Run not found');
    }

    try {
      await this.storage.stat(run.logFilePath);
    } catch {
      throw new NotFoundException('Log file not found');
    }

    response.download(run.logFilePath, `${id}.jsonl`, {
      dotfiles: 'allow',
      headers: { 'Content-Type': 'application/jsonl' },
    });
  }

  @Sse('/:id/stream')
  @ApiParam({ name: 'id', type: String })
  logStreamSse(@Param('id') id: string): Observable<MessageEvent> {
    return this.repository.getObservable(id);
  }
}
