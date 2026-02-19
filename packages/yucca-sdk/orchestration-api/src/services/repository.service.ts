import { Inject, Injectable } from '@nestjs/common';
import { RepositoryCreateResponseDto, RepositoryListResponseDto } from 'yucca-api-client';
import { Backend } from '../backends/backend';
import { LocalRepositoryDto, RepositoryConfigurationDto, RepositoryWithMetricsDto } from '../dto/repository.dto';
import { type ModuleConfig, ModuleConfigProvider } from '../moduleConfig';
import { BackendRepository } from '../repositories/backend.repository';
import { ConfigRepository } from '../repositories/config.repository';
import { RepositoryRepository } from '../repositories/repository.repository';
import { ResticRepository } from '../repositories/restic.repository';

@Injectable()
export class RepositoryService {
  constructor(
    private readonly backend: BackendRepository,
    private readonly config: ConfigRepository,
    private readonly restic: ResticRepository,
    private readonly repository: RepositoryRepository,
    @Inject(ModuleConfigProvider) private readonly moduleConfig: ModuleConfig,
  ) {}

  async createRepository(): Promise<RepositoryCreateResponseDto> {
    const backends = await this.backend.getBackends();
    const defaultBackend = backends[0];
    const backend = Backend.from(defaultBackend.configuration, this.moduleConfig);

    const { repository } = await backend.createRepository(false);

    const endpoint = await backend.getResticEndpoint(repository.id);
    const key = await this.config.getEncryptionKey();
    await this.restic.init(endpoint, key);

    await this.repository.create({
      id: repository.id,
      backendId: defaultBackend.id,
    });

    return { repository };
  }

  async getRepositories(): Promise<RepositoryListResponseDto> {
    const backends = await this.backend.getBackends();
    const repositories: LocalRepositoryDto[] = [];

    const backendsById = Object.fromEntries(backends.map((backend) => [backend.id, backend]));
    const remoteRepositories: Record<string, Record<string, RepositoryWithMetricsDto>> = {};

    for (const { id: backendId, configuration } of backends) {
      const backend = Backend.from(configuration, this.moduleConfig);
      remoteRepositories[backendId] = {};

      try {
        const { repositories: list } = await backend.getRepositories();

        for (const repository of list) {
          remoteRepositories[backendId][repository.id] = repository;
        }
      } catch (error) {
        console.error('Backend', backendId, 'threw', error);
      }
    }

    const localRepositories = await this.repository.getAll();
    for (const { id, backendId } of localRepositories) {
      const remoteRepository = remoteRepositories[backendId][id];

      const configuration: RepositoryConfigurationDto = {
        paths: ['todo'],
      };

      if (remoteRepository) {
        repositories.push({
          ...remoteRepository,
          backends: {
            primary: {
              id: backendId,
              type: backendsById[backendId].configuration.type,
              online: true,
            },
            secondary: [],
          },
          configuration,
        });

        delete remoteRepositories[backendId][id];
      } else {
        repositories.push({
          id,
          backends: {
            primary: {
              id: backendId,
              type: backendsById[backendId].configuration.type,
              online: false,
            },
            secondary: [],
          },
          metrics: {
            sizeBytes: 0,
          },
          worm: false,
          configuration,
        });
      }
    }

    for (const [backendId, list] of Object.entries(remoteRepositories)) {
      for (const remoteRepository of Object.values(list)) {
        repositories.push({
          ...remoteRepository,
          backends: {
            primary: {
              id: backendId,
              type: backendsById[backendId].configuration.type,
              online: true,
            },
            secondary: [],
          },
        });
      }
    }

    return {
      repositories,
    };
  }
}
