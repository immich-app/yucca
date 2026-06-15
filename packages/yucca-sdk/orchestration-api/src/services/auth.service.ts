import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createEventSource, EventSourceClient } from 'eventsource-client';
import { YUCCA_PRODUCTION_UUID } from '../const';
import { BackendType } from '../enum';
import { EventsGateway } from '../events/events.gateway';
import { BackendRepository } from '../repositories/backend.repository';
import { ConfigRepository } from '../repositories/config.repository';
import { ModuleConfigRepository } from '../repositories/moduleConfig.repository';

@Injectable()
export class AuthService {
  constructor(
    readonly config: ConfigRepository,
    readonly backend: BackendRepository,
    readonly moduleConfig: ModuleConfigRepository,
    readonly events: EventsGateway,
  ) {}

  private async waitForDeviceFlow(events: EventSourceClient) {
    for await (const { data } of events) {
      const { type, accessToken } = JSON.parse(data);

      switch (type) {
        case 'SUCCESS': {
          await this.backend.updateBackend(YUCCA_PRODUCTION_UUID, {
            type: BackendType.Yucca,
            accessToken,
          });

          this.events.publish({
            type: 'BackendCreate',
            backend: {
              id: YUCCA_PRODUCTION_UUID,
              type: BackendType.Yucca,
              description: 'FUTO Backups',
              isOnline: true,
            },
          });

          break;
        }
        case 'FAILURE': {
          this.events.publish({
            type: 'DeviceFlowFailure',
          });

          break;
        }
      }
    }

    events.close();
  }

  async oidcDeviceFlow(): Promise<{ userCode: string; verificationUri: string }> {
    const events: EventSourceClient = createEventSource({
      url: new URL('/api/auth/oidc/device', this.moduleConfig.get().yuccaProductionApi),
      onDisconnect: () => events.close(),
    });

    for await (const { data } of events) {
      const { userCode, verificationUri } = JSON.parse(data);

      void this.waitForDeviceFlow(events).catch(() => {});

      return {
        userCode,
        verificationUri,
      };
    }

    throw new InternalServerErrorException('Failed to start authentication with FUTO Backups');
  }
}
