import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { Backend } from '../backends/backend';
import {
  LocalRepositoryDto,
  RepositoryConfigurationDto,
  RepositoryCreateResponseDto,
  RepositoryListResponseDto,
  RepositoryWithMetricsDto,
} from '../dto/repository.dto';
import { type ModuleConfig, ModuleConfigProvider } from '../moduleConfig';
import { BackendRepository } from '../repositories/backend.repository';
import { ConfigRepository } from '../repositories/config.repository';
import { RepositoryRepository } from '../repositories/repository.repository';
import { RepositoryPathRepository } from '../repositories/repositoryPath.repository';
import { ResticRepository } from '../repositories/restic.repository';
import { RunHistoryRepository } from '../repositories/runHistory.repository';

@Injectable()
export class RepositoryService {
  constructor(
    private readonly backend: BackendRepository,
    private readonly config: ConfigRepository,
    private readonly restic: ResticRepository,
    private readonly runHistory: RunHistoryRepository,
    private readonly repository: RepositoryRepository,
    private readonly repositoryPath: RepositoryPathRepository,
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

    return {
      repository: {
        ...repository,
        backends: {
          primary: {
            id: defaultBackend.id,
            online: true,
            type: defaultBackend.configuration.type,
          },
          secondary: [],
        },
        configuration: {
          paths: [],
        },
      },
    };
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
    const localPaths = await this.repositoryPath.getAll();

    for (const { id, backendId } of localRepositories) {
      const remoteRepository = remoteRepositories[backendId][id];

      const configuration: RepositoryConfigurationDto = {
        paths: localPaths.filter((entry) => entry.id === id).map(({ path }) => path),
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

  async createBackup(id: string): Promise<void> {
    const localRepository = await this.repository.get(id);
    if (!localRepository) {
      throw new BadRequestException('Repository not found locally');
    }

    const backend = await this.backend.getBackend(localRepository.backendId);
    const backendInstance = Backend.from(backend.configuration, this.moduleConfig);
    const endpoint = await backendInstance.getResticEndpoint(id);
    const key = await this.config.getEncryptionKey();

    const paths = await this.repositoryPath.get(id);
    if (paths.length === 0) {
      throw new BadRequestException('Missing configuration paths');
    }

    await this.runHistory.createLog(id, (log) => this.restic.backup(endpoint, key, paths, log));
  }

  async addRepositoryPath(id: string, path: string): Promise<void> {
    await this.repositoryPath.create({ id, path });
  }

  async removeRepositoryPath(id: string, path: string): Promise<void> {
    await this.repositoryPath.delete(id, path);
  }
}
