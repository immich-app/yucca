import { Controller, Get, Param } from '@nestjs/common';
import { ApiOkResponse, ApiParam, ApiProperty } from '@nestjs/swagger';
import { readdir, readFile } from 'node:fs/promises';

export class LogsDto {
  @ApiProperty({ type: () => [String] })
  runs!: string[];
}

export class LogDto {
  @ApiProperty({ type: () => String })
  log!: string;
}

@Controller('/draft')
export class DraftController {
  @Get('/:id')
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({ type: LogsDto })
  async listRuns(@Param('id') id: string): Promise<LogsDto> {
    try {
      return {
        runs: await readdir(`.data/logs/${id}`),
      };
    } catch {
      return {
        runs: [],
      };
    }
  }

  @Get('/:id/:run')
  @ApiParam({ name: 'id', type: String })
  @ApiParam({ name: 'run', type: String })
  @ApiOkResponse({ type: LogDto })
  async getRun(@Param('id') id: string, @Param('run') run: string): Promise<LogDto> {
    return {
      log: await readFile(`.data/logs/${id}/${run}`).then((f) => f.toString()),
    };
  }
}
