import { BadRequestException, Injectable } from '@nestjs/common';
import { createWriteStream } from 'node:fs';
import { mkdir, rename } from 'node:fs/promises';
import {
  LocalRepositoryDto,
  RepositoryCreateResponseDto,
  RepositoryListResponseDto,
  RepositoryMetadataDto,
} from '../dto/repository.dto';
import { ConfigRepository } from '../repositories/config.repository';
import { ResticRepository } from '../repositories/restic.repository';
import { YuccaApiRepository } from '../repositories/yuccaApi.repository';

@Injectable()
export class RepositoryService {
  constructor(
    private readonly restic: ResticRepository,
    private readonly config: ConfigRepository,
    private readonly yucca: YuccaApiRepository,
  ) {}

  async createRepository(): Promise<RepositoryCreateResponseDto> {
    const { repository } = await this.yucca.createRepository(await this.config.getAccessTokenOrThrow(), false);
    const { url } = await this.yucca.createResticUrl(repository.id, await this.config.getAccessTokenOrThrow());
    const key = await this.config.getEncryptionKey();

    const metadata: RepositoryMetadataDto = {
      paths: [],
    };

    await this.restic.init(url, key);
    await this.config.saveRepositoryMetadata(repository.id, metadata);

    return {
      repository: {
        ...repository,
        local: metadata,
      },
    };
  }

  async getRepositories(): Promise<RepositoryListResponseDto> {
    const result = await this.yucca.getRepositories(await this.config.getAccessTokenOrThrow());
    const metadata = await this.config.getRepositoryMetadata();

    const repositories = result.repositories.map((repository: LocalRepositoryDto) => ({
      ...repository,
      local: metadata[repository.id] ?? false,
    }));

    // const key = await this.config.getEncryptionKey();
    // for (const repository of repositories) {
    //   if (repository.local) {
    //     const { url } = await this.yucca.createResticUrl(repository.id, await this.config.getAccessTokenOrThrow());

    //     try {
    //       const stats = await this.restic.stats(url, key);
    //       repository.metrics.sizeBytes = stats.total_size;
    //     } catch {
    //       repository.metrics.sizeBytes = 0;
    //     }
    //   }
    // }

    return {
      repositories,
    };
  }

  async createBackup(id: string): Promise<void> {
    const metadata = await this.config.getRepositoryMetadata();
    const config = metadata[id];

    if (!config || config.paths.length === 0) {
      throw new BadRequestException('Missing config.paths');
    }

    const { url } = await this.yucca.createResticUrl(id, await this.config.getAccessTokenOrThrow());
    const key = await this.config.getEncryptionKey();

    await mkdir(`.data/logs/${id}`, { recursive: true });

    const startTime = new Date();
    const logPath = `.data/logs/${id}/${startTime.toISOString()}`;
    const log = createWriteStream(`${logPath}.incomplete.txt`);

    try {
      await this.restic.backup(url, key, config.paths, log);
      log.close();
      await rename(`${logPath}.incomplete.txt`, `${logPath}.txt`);
    } catch (error) {
      log.write(`${error}`);
      log.close();
      await rename(`${logPath}.incomplete.txt`, `${logPath}.failed.txt`);
    }

    // debug:
    console.info(url);
  }

  async setRepositoryConfig(id: string, config: RepositoryMetadataDto): Promise<void> {
    await this.config.saveRepositoryMetadata(id, config);
  }
}
