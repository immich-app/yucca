import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import {
  RepositoryCreateRequestDto,
  RepositoryCreateResponseDto,
  RepositoryGetResponseDto,
  RepositoryListQueryDto,
  RepositoryListResponseDto,
  RepositoryUpdateRequestDto,
  RepositoryUpdateResponseDto,
  RepositoryUrlResponseDto,
} from 'src/dto/repository.dto';
import { AuthRoute } from 'src/middleware/auth.guard';
import { RepositoryService } from 'src/services/repository.service';

@Controller('/repository')
export class RepositoryController {
  constructor(private readonly repository: RepositoryService) {}

  @Get()
  @AuthRoute()
  @ApiOkResponse({ type: RepositoryListResponseDto })
  listRepositories(@Query() query: RepositoryListQueryDto): Promise<RepositoryListResponseDto> {
    return this.repository.list(query);
  }

  @Post()
  @AuthRoute()
  @ApiOkResponse({ type: RepositoryCreateResponseDto })
  createRepository(@Body() dto: RepositoryCreateRequestDto): Promise<RepositoryCreateResponseDto> {
    return this.repository.create(dto);
  }

  @Get('/:id')
  @AuthRoute()
  @ApiOkResponse({ type: RepositoryGetResponseDto })
  getRepository(@Param('id') id: string): Promise<RepositoryGetResponseDto> {
    return this.repository.get(id);
  }

  @Post('/:id/url')
  @AuthRoute()
  @ApiOkResponse({ type: RepositoryUrlResponseDto })
  repositoryUrl(@Param('id') id: string): Promise<RepositoryUrlResponseDto> {
    return this.repository.url(id);
  }

  @Patch('/:id')
  @AuthRoute()
  @ApiOkResponse({ type: RepositoryUpdateResponseDto })
  updateRepository(
    @Param('id') id: string,
    @Body() dto: RepositoryUpdateRequestDto,
  ): Promise<RepositoryUpdateResponseDto> {
    return this.repository.update(id, dto);
  }

  @Delete('/:id')
  @AuthRoute()
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteRepository(@Param('id') id: string): Promise<void> {
    return this.repository.delete(id);
  }
}
