import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiQuery } from '@nestjs/swagger';
import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { FilesystemListingRequestDto, FilesystemListingResponseDto } from '../dto/filesystem.dto';

@Controller('/yucca/fs')
export class FilesystemController {
  constructor() {}

  @Get()
  @ApiQuery({ name: 'path', type: String, required: false })
  @ApiOkResponse({ type: FilesystemListingResponseDto })
  async getFileListing(@Query() dto: FilesystemListingRequestDto): Promise<FilesystemListingResponseDto> {
    const path = dto.path ?? homedir();
    const files = await readdir(path);

    return {
      parent: dirname(path),
      path,
      items: await Promise.all(
        files
          .map((file) => resolve(path, file))
          .map(async (path) => ({
            path,
            isDirectory: await stat(path).then((s) => s.isDirectory()),
          }))
          .map((result) => result.catch(() => void 0)),
      ).then((result) => result.filter((entry) => entry !== undefined)),
    };
  }
}
