import { Inject, Injectable } from '@nestjs/common';
import { RepositoryCreateResponseDto, RepositoryListResponseDto } from 'yucca-api-client';
import { Backend } from '../backends/backend';
import { LocalRepositoryDto, RepositoryBackendDto } from '../dto/repository.dto';
import { type ModuleConfig, ModuleConfigProvider } from '../moduleConfig';
import { BackendRepository } from '../repositories/backend.repository';
import { ConfigRepository } from '../repositories/config.repository';
import { ResticRepository } from '../repositories/restic.repository';

@Injectable()
export class RepositoryService {
  constructor(
    private readonly backend: BackendRepository,
    private readonly config: ConfigRepository,
    private readonly restic: ResticRepository,
    @Inject(ModuleConfigProvider) private readonly moduleConfig: ModuleConfig,
  ) {}

  async createRepository(): Promise<RepositoryCreateResponseDto> {
    const backends = await this.backend.getBackends();
    const defaultBackend = backends[0];
    const backend = Backend.from(defaultBackend.configuration, this.moduleConfig);

    const { repository } = await backend.createRepository(false);

    // todo: restic init

    return { repository };
  }

  async getRepositories(): Promise<RepositoryListResponseDto> {
    const backends = await this.backend.getBackends();
    const repositories: LocalRepositoryDto[] = [];

    // todo: populate with local (& select primaries/secondaries from remotes list)
    // todo: populate with remote (non-local only)

    for (const { id: backendId, configuration } of backends) {
      const backend = Backend.from(configuration, this.moduleConfig);
      const { repositories: list } = await backend.getRepositories();
      repositories.push(
        ...list.map((repo) => ({
          ...repo,
          backend: {
            primary: {
              id: backendId,
              type: configuration.type,
            },
            secondary: [] as RepositoryBackendDto[],
          },
        })),
      );
    }

    // todo populate with configuration & local metrics in state

    return {
      repositories,
    };
  }
}
