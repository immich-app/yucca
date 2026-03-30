import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { LocalRepositoryDto } from '../dto/repository.dto';
import { RunningTaskDto } from '../dto/runningTasks.dto';
import { ScheduleDto } from '../dto/schedule.dto';
import { ModuleConfigRepository } from '../repositories/moduleConfig.repository';

type Event =
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
    };

type AuthFn = (client: Socket) => Promise<{ user: { isAdmin: boolean } }>;

@WebSocketGateway({
  cors: false,
  path: '/api/yucca/socket.io',
  transports: ['websocket'],
})
export class EventsGateway implements OnGatewayConnection {
  private authFn?: AuthFn;

  constructor(private readonly moduleConfig: ModuleConfigRepository) {}

  @WebSocketServer()
  server?: Server;

  publish(event: Event) {
    this.server?.emit(JSON.stringify(event));
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

  setAuthFn(fn: (client: Socket) => Promise<{ user: { isAdmin: boolean } }>) {
    this.authFn = fn;
  }

  private async authenticate(client: Socket) {
    if (!this.authFn) {
      if (this.moduleConfig.get().requireWsAuth) {
        throw new Error('Auth function not set');
      }

      return {
        user: {
          isAdmin: true,
        },
      };
    }

    return this.authFn(client);
  }
}
