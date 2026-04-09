import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { RunningTaskListResponse } from '../dto/runningTasks.dto';
import { RunningTasksService } from '../services/runningTasks.service';

@Controller('/tasks')
export class RunningTasksController {
  constructor(private readonly service: RunningTasksService) {}

  @Get()
  @ApiOkResponse({ type: RunningTaskListResponse })
  getRunningTasks(): RunningTaskListResponse {
    return this.service.getTasks();
  }
}
