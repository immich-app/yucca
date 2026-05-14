import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOkResponse, ApiParam } from '@nestjs/swagger';
import { RunningTaskListResponse } from '../dto/runningTasks.dto';
import { RunningTasksService } from '../services/runningTasks.service';

@Controller('/yucca/tasks')
export class RunningTasksController {
  constructor(private readonly service: RunningTasksService) {}

  @Get()
  @ApiOkResponse({ type: RunningTaskListResponse })
  getRunningTasks(): RunningTaskListResponse {
    return this.service.getTasks();
  }

  @Post('/:parentId/cancel')
  @ApiParam({ name: 'parentId', type: String })
  cancelTask(@Param('parentId') parentId: string): void {
    this.service.cancelTask(parentId);
  }
}
