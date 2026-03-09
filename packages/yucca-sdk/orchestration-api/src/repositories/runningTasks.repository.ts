import { Injectable } from '@nestjs/common';
import { RunningTaskDto } from '../dto/runningTasks.dto';
import { TaskType } from '../enum';
import { EventsGateway } from '../events/events.gateway';

@Injectable()
export class RunningTasksRepository {
  activeTasks = new Map<string, RunningTaskDto>();

  constructor(private readonly events: EventsGateway) {}

  canStart(parentId: string) {
    return !this.activeTasks.has(parentId);
  }

  startTask(parentId: string, type: TaskType, logId?: string) {
    const task: RunningTaskDto = {
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

  updateTask(parentId: string, data: Partial<RunningTaskDto>) {
    const task = this.activeTasks.get(parentId);
    if (!task) {
      throw new Error(`Task for parent ${parentId} does not exist.`);
    }

    this.activeTasks.set(parentId, {
      ...task,
      ...data,
    });

    this.events.publish({
      type: 'TaskUpdate',
      parentId,
      task: data,
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
