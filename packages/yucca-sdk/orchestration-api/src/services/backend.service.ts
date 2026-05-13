import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Backend } from '../backends/backend';
import { BackendResponseDto, BackendsResponseDto, CreateLocalBackendRequestDto } from '../dto/backend.dto';
import { BackendType } from '../enum';
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

  async createLocalBackend(dto: CreateLocalBackendRequestDto): Promise<BackendResponseDto> {
    const { id } = await this.repository.updateBackend(randomUUID(), {
      type: BackendType.Local,
      path: dto.path,
    });

    return {
      backend: {
        type: BackendType.Local,
        id,
        isOnline: true,
      },
    };
  }
}
