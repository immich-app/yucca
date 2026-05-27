import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Query } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import {
  RepositoryGetResponseDto,
  RepositoryListQueryDto,
  RepositoryListResponseDto,
  RepositoryUpdateRequestDto,
  RepositoryUpdateResponseDto,
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

  @Get('/:id')
  @AuthRoute()
  @ApiOkResponse({ type: RepositoryGetResponseDto })
  getRepository(@Param('id') id: string): Promise<RepositoryGetResponseDto> {
    return this.repository.get(id);
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
