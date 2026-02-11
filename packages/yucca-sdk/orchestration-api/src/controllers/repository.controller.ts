import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOkResponse, ApiParam } from '@nestjs/swagger';
import { RepositoryCreateResponseDto, RepositoryListResponseDto } from '../dto/repository.dto.js';
import { ConfigRepository } from '../repositories/config.repository.js';
import { ResticRepository } from '../repositories/restic.repository.js';
import { YuccaApiRepository } from '../repositories/yuccaApi.repository.js';
import { RepositoryService } from '../services/repository.service.js';

@Controller('/repository')
export class RepositoryController {
  constructor(
    private readonly service: RepositoryService,
    private readonly restic: ResticRepository,
    private readonly config: ConfigRepository,
    private readonly yucca: YuccaApiRepository,
  ) {}

  @Post()
  @ApiOkResponse({ type: RepositoryCreateResponseDto })
  async createRepository(): Promise<RepositoryCreateResponseDto> {
    const { repository } = await this.service.createRepository();
    const { url } = await this.yucca.createResticUrl(repository.id, await this.config.getAccessTokenOrThrow());
    const key = await this.config.getEncryptionKey();

    await this.restic.init(url, key);

    return {
      repository: {
        ...repository,
        local: true,
      },
    };
  }

  @Get()
  @ApiOkResponse({ type: RepositoryListResponseDto })
  async getRepositories(): Promise<RepositoryListResponseDto> {
    const { repositories } = await this.service.getRepositories();
    return {
      repositories: repositories.map((repository) => ({
        ...repository,
        local: true,
      })),
    };
  }

  @Post('/:id')
  @ApiParam({ name: 'id', type: String })
  async createBackup(@Param('id') id: string) {
    const { url } = await this.yucca.createResticUrl(id, await this.config.getAccessTokenOrThrow());
    const key = await this.config.getEncryptionKey();

    await this.restic.backup(url, key);

    console.info(url);
  }
}
