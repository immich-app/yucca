import { Injectable } from '@nestjs/common';
import { EventsGateway, GatewayEvent } from '../events/events.gateway';
import type { ImmichIntegration } from '../moduleConfig';
import { ModuleConfigRepository } from '../repositories/moduleConfig.repository';

@Injectable()
export class YuccaService {
  constructor(
    private readonly moduleConfig: ModuleConfigRepository,
    private readonly events: EventsGateway,
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
}
