import { Injectable } from '@nestjs/common';
import { EventsGateway, GatewayEvent } from '../events/events.gateway';
import type { ImmichIntegration } from '../moduleConfig';
import { ModuleConfigRepository } from '../repositories/moduleConfig.repository';
import { RepositoryService } from './repository.service';

@Injectable()
export class YuccaService {
  constructor(
    private readonly moduleConfig: ModuleConfigRepository,
    private readonly events: EventsGateway,
    private readonly repositoryService: RepositoryService,
  ) {}

  setExternalBaseUrl(externalBaseUrl: string) {
    this.moduleConfig.update({ externalBaseUrl });
  }

  setImmichIntegration(immichIntegration: ImmichIntegration) {
    this.moduleConfig.update({ immichIntegration });
  }

  acquireLock() {
    this.moduleConfig.acquireLock();
  }

  emit(event: GatewayEvent) {
    this.events.emit(event);
  }

  async restoreSnapshotInplace(repositoryId: string, snapshotId: string) {
    const { snapshot } = await this.repositoryService.getSnapshot(repositoryId, snapshotId);

    return {
      ...(await this.repositoryService.restoreSnapshot(repositoryId, snapshotId, {})),
      tags: snapshot.tags ?? [],
    };
  }
}
