import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiQuery } from '@nestjs/swagger';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { FilesystemListingRequestDto, FilesystemListingResponseDto } from '../dto/filesystem.dto';
import { StorageRepository } from '../repositories/storage.repository';

@Controller('/yucca/fs')
export class FilesystemController {
  constructor(private readonly storage: StorageRepository) {}

  @Get()
  @ApiQuery({ name: 'path', type: String, required: false })
  @ApiOkResponse({ type: FilesystemListingResponseDto })
  async getFileListing(@Query() dto: FilesystemListingRequestDto): Promise<FilesystemListingResponseDto> {
    const path = dto.path ?? homedir();
    const files = await this.storage.readdir(path);

    return {
      parent: dirname(path),
      path,
      items: await Promise.all(
        files
          .map((file) => resolve(path, file))
          .map(async (path) => ({
            path,
            isDirectory: await this.storage.stat(path).then((s) => s.isDirectory()),
          }))
          .map((result) => result.catch(() => void 0)),
      ).then((result) => result.filter((entry) => entry !== undefined)),
    };
  }
}
