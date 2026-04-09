import { Inject, Injectable } from '@nestjs/common';
import { Backend } from '../backends/backend';
import { BackendsResponseDto } from '../dto/backend.dto';
import { type ModuleConfig, ModuleConfigProvider } from '../moduleConfig';
import { BackendRepository } from '../repositories/backend.repository';

@Injectable()
export class BackendService {
  constructor(
    @Inject(ModuleConfigProvider) private readonly moduleConfig: ModuleConfig,
    private readonly repository: BackendRepository,
  ) {}

  async getBackends(): Promise<BackendsResponseDto> {
    const backends = await this.repository.getBackends();

    const error = await Promise.all(
      backends.map((backend) =>
        Backend.from(backend.configuration, this.moduleConfig)
          .checkOnline()
          .then(() => void 0)
          .catch((error) => error),
      ),
    );

    return {
      backends: backends.map((backend, idx) => ({
        id: backend.id,
        type: backend.configuration.type,
        isOnline: error[idx] === undefined,
        error: error[idx],
      })),
    };
  }
}
