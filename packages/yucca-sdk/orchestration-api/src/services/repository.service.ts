import { Injectable } from '@nestjs/common';
import { ConfigRepository } from 'src/repositories/config.repository';
import { YuccaApiRepository } from 'src/repositories/yuccaApi.repository';
import { RepositoryCreateResponseDto, RepositoryListResponseDto } from 'yucca-api-client';

@Injectable()
export class RepositoryService {
  constructor(
    private readonly config: ConfigRepository,
    private readonly yucca: YuccaApiRepository,
  ) {}

  createRepository(): Promise<RepositoryCreateResponseDto> {
    return this.yucca.createRepository(this.config.getAccessToken(), false);
  }

  getRepositories(): Promise<RepositoryListResponseDto> {
    return this.yucca.getRepositories(this.config.getAccessToken());
  }
}
