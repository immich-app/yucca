import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Backend } from '../backends/backend';
import { BackendResponseDto, BackendsResponseDto, CreateLocalBackendRequestDto } from '../dto/backend.dto';
import { BackendType } from '../enum';
import { EventsGateway } from '../events/events.gateway';
import { BackendRepository } from '../repositories/backend.repository';

@Injectable()
export class BackendService {
  constructor(
    private readonly repository: BackendRepository,
    private readonly events: EventsGateway,
  ) {}

  async getBackends(): Promise<BackendsResponseDto> {
    const backends = await this.repository.getBackends();

    const error = await Promise.all(
      backends.map((backend) =>
        Backend.from(backend.configuration)
          .checkOnline()
          .then(() => void 0)
          .catch((error) => error),
      ),
    );

    return {
      backends: backends.map((backend, idx) => ({
        id: backend.id,
        type: backend.configuration.type,
        description:
          backend.configuration.type === BackendType.Yucca
            ? backend.configuration.url || 'FUTO Backups'
            : backend.configuration.type === BackendType.Local
              ? backend.configuration.path
              : backend.configuration.endpoint,
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

    const backend = {
      type: BackendType.Local,
      id,
      description: dto.path,
      isOnline: true,
    };

    this.events.publish({
      type: 'BackendCreate',
      backend,
    });

    return { backend };
  }
}
