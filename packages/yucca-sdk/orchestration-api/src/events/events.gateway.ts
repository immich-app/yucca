import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { LocalRepositoryDto } from '../dto/repository.dto';

type Event =
  | {
      type: 'RepositoryCreate';
      repository: LocalRepositoryDto;
    }
  | {
      type: 'RepositoryUpdate';
      repositoryId: string;
      repository: Partial<LocalRepositoryDto>;
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
