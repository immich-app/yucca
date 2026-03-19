import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { LocalRepositoryDto } from '../dto/repository.dto';
import { RunningTaskDto } from '../dto/runningTasks.dto';
import { ScheduleDto } from '../dto/schedule.dto';

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

@WebSocketGateway({
  cors: false,
  path: '/socket.io',
  transports: ['websocket'],
})
export class EventsGateway {
  @WebSocketServer()
  server?: Server;

  publish(event: Event) {
    this.server?.emit(JSON.stringify(event));
  }
}
