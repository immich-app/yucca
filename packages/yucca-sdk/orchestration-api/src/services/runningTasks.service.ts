import { Injectable } from '@nestjs/common';
import { RunningTaskListResponse } from '../dto/runningTasks.dto';
import { RunningTasksRepository } from '../repositories/runningTasks.repository';

@Injectable()
export class RunningTasksService {
  constructor(private readonly tasks: RunningTasksRepository) {}

  getTasks(): RunningTaskListResponse {
    return {
      tasks: [...this.tasks.activeTasks.values()],
    };
  }
}
