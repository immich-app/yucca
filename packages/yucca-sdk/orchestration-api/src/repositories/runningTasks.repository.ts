import { Injectable, NotFoundException } from '@nestjs/common';
import { RunningTaskDto } from '../dto/runningTasks.dto';
import { TaskType } from '../enum';
import { EventsGateway } from '../events/events.gateway';

@Injectable()
export class RunningTasksRepository {
  activeTasks = new Map<string, RunningTaskDto>();
  private controllers = new Map<string, AbortController>();

  constructor(private readonly events: EventsGateway) {}

  canStart(parentId: string) {
    return !this.activeTasks.has(parentId);
  }

  startTask(parentId: string, type: TaskType, logId?: string, signal?: AbortSignal): AbortSignal {
    const task: RunningTaskDto = {
      parentId,
      type,
      logId,
    };

    const controller = new AbortController();

    signal?.addEventListener('abort', () => controller.abort(signal.reason), { once: true });

    this.activeTasks.set(parentId, task);
    this.controllers.set(parentId, controller);

    this.events.publish({
      type: 'TaskStart',
      task,
    });

    return controller.signal;
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
    this.controllers.delete(parentId);
    this.events.publish({
      type: 'TaskEnd',
      parentId,
    });
  }

  cancelTask(parentId: string) {
    const controller = this.controllers.get(parentId);
    if (!controller) {
      throw new NotFoundException(`No running task for parent ${parentId}`);
    }

    controller.abort();
  }
}
