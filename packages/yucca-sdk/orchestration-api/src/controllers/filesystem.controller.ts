import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiQuery } from '@nestjs/swagger';
import { FilesystemListingRequestDto, FilesystemListingResponseDto } from '../dto/filesystem.dto';
import { FilesystemService } from '../services/filesystem.service';

@Controller('/yucca/fs')
export class FilesystemController {
  constructor(private readonly service: FilesystemService) {}

  @Get()
  @ApiQuery({ name: 'path', type: String, required: false })
  @ApiOkResponse({ type: FilesystemListingResponseDto })
  async getFileListing(@Query() dto: FilesystemListingRequestDto): Promise<FilesystemListingResponseDto> {
    return this.service.getFileListing(dto);
  }
}
