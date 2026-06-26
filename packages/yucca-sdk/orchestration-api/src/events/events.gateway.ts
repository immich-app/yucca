import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { EventEmitter } from 'node:events';
import { Server, Socket } from 'socket.io';
import { BackendDto } from '../dto/backend.dto';
import { IntegrationsResponseDto } from '../dto/integrations.dto';
import { LocalRepositoryDto, RunDto } from '../dto/repository.dto';
import { RunningTaskDto } from '../dto/runningTasks.dto';
import { ScheduleDto } from '../dto/schedule.dto';
import { ModuleConfigRepository } from '../repositories/moduleConfig.repository';

export type GatewayEvent =
  | {
      type: 'BackendCreate';
      backend: BackendDto;
    }
  | {
      type: 'RepositoryCreate';
      repository: LocalRepositoryDto;
    }
  | {
      type: 'RepositoryUpdate';
      repositoryId: string;
      repository: Partial<LocalRepositoryDto>;
    }
  | {
      type: 'RepositoryDelete';
      repositoryId: string;
    }
  | {
      type: 'IntegrationUpdate';
      integrations: IntegrationsResponseDto;
    }
  | {
      type: 'ScheduleCreate';
      schedule: ScheduleDto;
    }
  | {
      type: 'ScheduleUpdate';
      scheduleId: string;
      schedule: Partial<ScheduleDto>;
    }
  | {
      type: 'ScheduleDelete';
      scheduleId: string;
    }
  | {
      type: 'TaskStart';
      task: RunningTaskDto;
    }
  | {
      type: 'TaskUpdate';
      parentId: string;
      task: Partial<RunningTaskDto>;
    }
  | {
      type: 'TaskEnd';
      parentId: string;
    }
  | {
      type: 'RunCreate';
      run: RunDto;
    }
  | {
      type: 'RunUpdate';
      runId: string;
      repositoryId: string;
      run: Partial<RunDto>;
    }
  | {
      type: 'DeviceFlowFailure';
    };

@WebSocketGateway({
  cors: false,
  path: '/api/yucca/socket.io',
  transports: ['websocket'],
})
export class EventsGateway implements OnGatewayConnection {
  private emitter = new EventEmitter();

  constructor(private readonly moduleConfig: ModuleConfigRepository) {}

  @WebSocketServer()
  server?: Server;

  publish(event: GatewayEvent) {
    this.server?.emit(JSON.stringify(event));
    this.emitter.emit('event', event);
  }

  emit(event: GatewayEvent) {
    this.server?.emit(JSON.stringify(event));
  }

  on(listener: (event: GatewayEvent) => void) {
    this.emitter.on('event', listener);
  }

  off(listener: (event: GatewayEvent) => void) {
    this.emitter.off('event', listener);
  }

  async handleConnection(client: Socket) {
    try {
      const { user } = await this.authenticate(client);
      if (!user.isAdmin) {
        throw new Error("User isn't admin.");
      }
    } catch {
      client.disconnect();
    }
  }

  private async authenticate(client: Socket) {
    const { authenticate, requireWsAuth } = this.moduleConfig.get();

    if (!authenticate) {
      if (requireWsAuth) {
        throw new Error('Auth function not set');
      }

      return {
        user: {
          isAdmin: true,
        },
      };
    }

    return authenticate(client);
  }
}
