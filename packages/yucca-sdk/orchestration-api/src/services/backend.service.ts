import { Injectable } from '@nestjs/common';
import { Backend } from '../backends/backend';
import { BackendsResponseDto } from '../dto/backend.dto';
import { BackendRepository } from '../repositories/backend.repository';
import { ModuleConfigRepository } from '../repositories/moduleConfig.repository';

@Injectable()
export class BackendService {
  constructor(
    private readonly moduleConfig: ModuleConfigRepository,
    private readonly repository: BackendRepository,
  ) {}

  async getBackends(): Promise<BackendsResponseDto> {
    const backends = await this.repository.getBackends();

    const error = await Promise.all(
      backends.map((backend) =>
        Backend.from(backend.configuration, this.moduleConfig.get())
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
