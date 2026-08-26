import {
  adoptRepositories,
  getAuth,
  type DeviceFlowEventDto as UpstreamDeviceFlowEvent,
} from '@futo-org/backups-api-client';
import { Injectable } from '@nestjs/common';
import { EventIterator } from 'event-iterator';
import { createEventSource, EventSourceClient } from 'eventsource-client';
import { hostname } from 'node:os';
import { from } from 'rxjs';
import { REPOSITORY_DEFAULT_CLOUD_UUID } from '../const';
import { DeviceFlowEventDto } from '../dto/auth.dto';
import { BackendType, CookieName, DeviceFlowEventType, DeviceFlowFailureReason } from '../enum';
import { EventsGateway } from '../events/events.gateway';
import { BackendRepository } from '../repositories/backend.repository';
import { ConfigRepository } from '../repositories/config.repository';
import { ModuleConfigRepository } from '../repositories/moduleConfig.repository';
import { RepositoryRepository } from '../repositories/repository.repository';
import { yuccaWellKnown } from '../wellKnown';
import { SessionService } from './session.service';
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
    readonly session: SessionService,
  ) {}

  private connectionType(): string {
    return this.moduleConfig.get().immichIntegration ? 'immich' : 'standalone';
  }

  private connectionName(): string {
    const fallback = hostname() || this.connectionType();
    const external = this.moduleConfig.get().externalBaseUrl;
    if (external) {
      try {
        return new URL(external).host;
      } catch {
        return fallback;
      }
    }

    return fallback;
  }

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

  private async fetchBackendUserId(endpoint: string, accessToken: string): Promise<string> {
    const auth = await getAuth({
      baseUrl: endpoint,
      headers: { cookie: `${CookieName.YuccaAccessToken}=${accessToken}` },
    });

    return auth.id;
  }

  private async connectBackend(endpoint: string, accessToken: string, userId: string): Promise<void> {
    const previous = await this.session.cloudConfiguration();

    await this.backend.updateBackend(REPOSITORY_DEFAULT_CLOUD_UUID, {
      type: BackendType.Yucca,
      accessToken,
      userId,
    });

    if (previous?.userId && previous.userId !== userId) {
      await this.config.rotateSessionSecret();
    }

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
  }

  private async relayDeviceFlow(
    identity: boolean,
    endpoint: string,
    publish: (event: DeviceFlowEventDto) => void,
  ): Promise<UpstreamDeviceFlowEvent | undefined> {
    const url = new URL(identity ? '/api/auth/oidc/device/identity' : '/api/auth/oidc/device', endpoint);
    if (!identity) {
      url.searchParams.set('connection_type', this.connectionType());
      url.searchParams.set('connection_name', this.connectionName());
    }

    const events: EventSourceClient = createEventSource({
      url,
      onDisconnect: () => events.close(),
    });

    const connectTimeout = setTimeout(() => events.close(), 10_000);

    try {
      for await (const { data } of events) {
        clearTimeout(connectTimeout);
        const message = JSON.parse(data) as UpstreamDeviceFlowEvent;

        if (message.type === 'START') {
          publish({
            type: DeviceFlowEventType.Start,
            userCode: message.userCode,
            verificationUri: message.verificationUri,
          });
          continue;
        }

        if (message.type === 'SUCCESS') {
          return message;
        }

        if (message.type === 'FAILURE') {
          this.telemetry.submitStructuredLog('Device flow authentication failed', { reason: message.reason });
          return;
        }
      }
    } finally {
      clearTimeout(connectTimeout);
      events.close();
    }
  }

  private async runDeviceFlow(identity: boolean, publish: (event: DeviceFlowEventDto) => void): Promise<void> {
    const cloud = await this.session.cloudConfiguration();
    if (identity && !cloud) {
      publish({ type: DeviceFlowEventType.Failure, reason: DeviceFlowFailureReason.NotConnected });
      return;
    }

    const endpoint = await yuccaWellKnown.getBaseUrl();
    const upstream = await this.relayDeviceFlow(identity, endpoint, publish);
    if (!upstream) {
      publish({ type: DeviceFlowEventType.Failure, reason: DeviceFlowFailureReason.DeviceFlowFailed });
      return;
    }

    if (!upstream.userId) {
      throw new Error('Device flow succeeded without a user');
    }

    const userId = upstream.userId;
    let backendId: string | undefined;

    if (identity) {
      const configuration = cloud!;
      let claimedUserId = configuration.userId;

      if (!claimedUserId) {
        claimedUserId = await this.fetchBackendUserId(endpoint, configuration.accessToken);
        await this.backend.updateBackend(REPOSITORY_DEFAULT_CLOUD_UUID, { ...configuration, userId: claimedUserId });
      }

      if (userId !== claimedUserId) {
        publish({ type: DeviceFlowEventType.Failure, reason: DeviceFlowFailureReason.WrongAccount });
        return;
      }
    } else {
      const { accessToken } = upstream;
      if (!accessToken) {
        throw new Error('Device flow succeeded without an access token');
      }

      backendId = REPOSITORY_DEFAULT_CLOUD_UUID;
      await this.connectBackend(endpoint, accessToken, userId);
    }

    const isRequired = await this.session.isRequired();

    publish({
      type: DeviceFlowEventType.Success,
      token: isRequired ? await this.session.issue(userId) : undefined,
      backendId,
    });
  }

  deviceFlow(identity: boolean) {
    return from(
      new EventIterator<MessageEvent>(
        (queue) =>
          void this.runDeviceFlow(identity, (event) => queue.push({ data: event } as MessageEvent))
            .catch((error) => {
              this.telemetry.submitStructuredLog('Device flow authentication errored', { error });
              queue.push({
                data: { type: DeviceFlowEventType.Failure, reason: DeviceFlowFailureReason.Unknown },
              } as MessageEvent);
            })
            .finally(() => queue.stop()),
      ),
    );
  }
}
