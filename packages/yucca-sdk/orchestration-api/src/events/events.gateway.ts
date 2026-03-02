import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { ActiveTaskDto, LocalRepositoryDto } from '../dto/repository.dto';

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
      type: 'TaskStart';
      task: ActiveTaskDto;
    }
  | {
      type: 'TaskEnd';
      parentId: string;
    };

@WebSocketGateway({
  cors: true,
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
