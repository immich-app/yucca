import { Injectable } from '@nestjs/common';
import { ActiveTaskDto } from '../dto/repository.dto';
import { TaskType } from '../enum';
import { EventsGateway } from '../events/events.gateway';

@Injectable()
export class RunningTasksRepository {
  activeTasks = new Map<string, ActiveTaskDto>();

  constructor(private readonly events: EventsGateway) {}

  canStart(parentId: string) {
    return !this.activeTasks.has(parentId);
  }

  startTask(parentId: string, type: TaskType, logId?: string) {
    const task: ActiveTaskDto = {
      parentId,
      type,
      logId,
    };

    this.activeTasks.set(parentId, task);
    this.events.publish({
      type: 'TaskStart',
      task,
    });
  }

  endTask(parentId: string) {
    this.activeTasks.delete(parentId);
    this.events.publish({
      type: 'TaskEnd',
      parentId,
    });
  }
}
