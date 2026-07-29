import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createEventSource, EventSourceClient } from 'eventsource-client';
import { REPOSITORY_DEFAULT_CLOUD_UUID } from '../const';
import { BackendType } from '../enum';
import { EventsGateway } from '../events/events.gateway';
import { BackendRepository } from '../repositories/backend.repository';
import { ConfigRepository } from '../repositories/config.repository';
import { yuccaWellKnown } from '../wellKnown';
import { TelemetryService } from './telemetry.service';

@Injectable()
export class AuthService {
  constructor(
    readonly config: ConfigRepository,
    readonly backend: BackendRepository,
    readonly events: EventsGateway,
    readonly telemetry: TelemetryService,
  ) {}

  private async waitForDeviceFlow(events: EventSourceClient) {
    for await (const { data } of events) {
      const { type, accessToken } = JSON.parse(data);

      switch (type) {
        case 'SUCCESS': {
          await this.backend.updateBackend(REPOSITORY_DEFAULT_CLOUD_UUID, {
            type: BackendType.Yucca,
            accessToken,
          });

          this.telemetry.submitStructuredLog('Connected FUTO Backups backend', {
            backendId: REPOSITORY_DEFAULT_CLOUD_UUID,
          });

          this.events.publish({
            type: 'BackendCreate',
            backend: {
              id: REPOSITORY_DEFAULT_CLOUD_UUID,
              type: BackendType.Yucca,
              description: 'FUTO Backups',
              isOnline: true,
            },
          });

          break;
        }
        case 'FAILURE': {
          this.telemetry.submitStructuredLog('Device flow authentication failed', {});

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
    const endpoint = await yuccaWellKnown.getBaseUrl();

    const events: EventSourceClient = createEventSource({
      url: new URL('/api/auth/oidc/device', endpoint),
      onDisconnect: () => events.close(),
    });

    const connectTimeout = setTimeout(() => events.close(), 10_000);

    for await (const { data } of events) {
      clearTimeout(connectTimeout);
      const { userCode, verificationUri } = JSON.parse(data);

      void this.waitForDeviceFlow(events).catch((error) => {
        this.telemetry.submitStructuredLog('Device flow authentication errored', { error });
        this.events.publish({ type: 'DeviceFlowFailure' });
      });

      return {
        userCode,
        verificationUri,
      };
    }

    throw new InternalServerErrorException('Failed to start authentication with FUTO Backups');
  }
}
