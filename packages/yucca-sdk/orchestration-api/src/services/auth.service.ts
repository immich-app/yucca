import { adoptRepositories, getAuth } from '@futo-org/backups-api-client';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createEventSource, EventSourceClient } from 'eventsource-client';
import { hostname } from 'node:os';
import { yuccaWellKnown } from '../backends/yucca.backend';
import { REPOSITORY_DEFAULT_CLOUD_UUID } from '../const';
import { BackendType, CookieName } from '../enum';
import { EventsGateway } from '../events/events.gateway';
import { BackendRepository } from '../repositories/backend.repository';
import { ConfigRepository } from '../repositories/config.repository';
import { ModuleConfigRepository } from '../repositories/moduleConfig.repository';
import { RepositoryRepository } from '../repositories/repository.repository';
import { TelemetryService } from './telemetry.service';

@Injectable()
export class AuthService {
  constructor(
    readonly config: ConfigRepository,
    readonly backend: BackendRepository,
    readonly moduleConfig: ModuleConfigRepository,
    readonly events: EventsGateway,
    readonly telemetry: TelemetryService,
    readonly repository: RepositoryRepository,
  ) {}

  // Names this immich instance's connection. Prefer the external URL host (stable,
  // identifies the deployment); fall back to the machine hostname.
  private connectionName(): string {
    const external = this.moduleConfig.get().externalBaseUrl;
    if (external) {
      try {
        return new URL(external).host;
      } catch {
        // fall through to hostname
      }
    }
    return hostname() || 'immich';
  }

  // After login the session is bound to this instance's immich connection, so new
  // repositories land on it automatically. Pre-existing repositories still sit
  // on the user's default connection — adopt them onto this instance. Best-effort:
  // adoption never blocks a successful login.
  private async adoptOwnRepositories(endpoint: string | undefined, accessToken: string): Promise<void> {
    try {
      const requestOptions = {
        baseUrl: endpoint,
        headers: { cookie: `${CookieName.YuccaAccessToken}=${accessToken}` },
      };

      const auth = await getAuth(requestOptions);
      if (!auth.connectionId) {
        return;
      }

      const repositories = await this.repository.getAll();
      const repositoryIds = repositories
        .filter((row) => row.backendId === REPOSITORY_DEFAULT_CLOUD_UUID)
        .map((row) => row.remoteId);
      if (repositoryIds.length === 0) {
        return;
      }

      await adoptRepositories(auth.connectionId, { repositoryIds }, requestOptions);
      this.telemetry.submitStructuredLog('Adopted repositories into instance connection', {
        connectionId: auth.connectionId,
        count: repositoryIds.length,
      });
    } catch (error) {
      this.telemetry.submitStructuredLog('Repository adoption skipped', { error: String(error) });
    }
  }

  private async waitForDeviceFlow(events: EventSourceClient, overrideEndpoint: string | undefined, endpoint: string) {
    for await (const { data } of events) {
      const { type, accessToken } = JSON.parse(data);

      switch (type) {
        case 'SUCCESS': {
          await this.backend.updateBackend(REPOSITORY_DEFAULT_CLOUD_UUID, {
            type: BackendType.Yucca,
            accessToken,
            url: overrideEndpoint,
          });

          await this.adoptOwnRepositories(endpoint, accessToken);

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
    const overrideEndpoint = this.moduleConfig.get().yuccaProductionApi;
    const endpoint = overrideEndpoint ?? (await yuccaWellKnown.getBaseUrl());

    // Register this session as a named immich connection instance.
    const url = new URL('/api/auth/oidc/device', endpoint);
    url.searchParams.set('connection_type', 'immich');
    url.searchParams.set('connection_name', this.connectionName());

    const events: EventSourceClient = createEventSource({
      url,
      onDisconnect: () => events.close(),
    });

    const connectTimeout = setTimeout(() => events.close(), 10_000);

    for await (const { data } of events) {
      clearTimeout(connectTimeout);
      const { userCode, verificationUri } = JSON.parse(data);

      void this.waitForDeviceFlow(events, overrideEndpoint, endpoint).catch((error) => {
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
