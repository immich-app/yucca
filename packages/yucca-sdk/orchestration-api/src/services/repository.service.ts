import { Injectable } from '@nestjs/common';
import { RepositoryCreateResponseDto, RepositoryListResponseDto } from 'yucca-api-client';
import { ConfigRepository } from '../repositories/config.repository';
import { YuccaApiRepository } from '../repositories/yuccaApi.repository';

@Injectable()
export class RepositoryService {
  constructor(
    private readonly config: ConfigRepository,
    private readonly yucca: YuccaApiRepository,
  ) {}

  async createRepository(): Promise<RepositoryCreateResponseDto> {
    return this.yucca.createRepository(await this.config.getAccessTokenOrThrow(), false);
  }

  async getRepositories(): Promise<RepositoryListResponseDto> {
    return this.yucca.getRepositories(await this.config.getAccessTokenOrThrow());
  }
}
