import { BadRequestException, Injectable } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob, CronTime } from 'cron';
import { Updateable } from 'kysely';
import { randomUUID } from 'node:crypto';
import { ActiveScheduleItemDto } from '../dto/runningTasks.dto';
import {
  ScheduleCreateRequestDto,
  ScheduleCreateResponseDto,
  ScheduleListResponseDto,
  ScheduleUpdateRequestDto,
  ScheduleUpdateResponseDto,
} from '../dto/schedule.dto';
import { TaskStatus, TaskType } from '../enum';
import { EventsGateway } from '../events/events.gateway';
import { ModuleConfigRepository } from '../repositories/moduleConfig.repository';
import { RepositoryIntegrationImmichRepository } from '../repositories/repositoryIntegrationImmich.repository';
import { RunningTasksRepository } from '../repositories/runningTasks.repository';
import { ScheduleRepository } from '../repositories/schedule.repository';
import { ScheduleTable } from '../schema/tables/schedule.table';
import { RepositoryService } from './repository.service';

@Injectable()
export class ScheduleService {
  constructor(
    private readonly repository: RepositoryService, // TODO: invoke indirectly?
    private readonly events: EventsGateway,
    private readonly schedule: ScheduleRepository,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly runningTasks: RunningTasksRepository,
    private readonly moduleConfig: ModuleConfigRepository,
    private readonly integrationImmich: RepositoryIntegrationImmichRepository,
  ) {}

  async bootstrap() {
    for (const schedule of await this.schedule.getAll()) {
      this.createCronJob(schedule.id, schedule.cron, schedule.paused);
    }
  }

  private createCronJob(id: string, cron: string, paused: boolean): void {
    this.schedulerRegistry.addCronJob(
      id,
      new CronJob<null, null>(
        cron, // expression
        () => this.runSchedule(id), // onTick
        undefined, // onComplete
        !paused, // started
        undefined, // timezone
        undefined, // context
        undefined, // runOnInit
        undefined, // utcOffset
        true, // clean up when process exists
      ),
    );
  }

  private updateCronJob(id: string, cron: string, paused: boolean): void {
    const job = this.schedulerRegistry.getCronJob(id);
    job.setTime(new CronTime(cron));

    if (paused) {
      void job.stop();
    } else {
      job.start();
    }
  }

  private async runSchedule(id: string) {
    if (!this.moduleConfig.hasLock()) {
      return;
    }

    const { repositories } = await this.schedule.get(id);

    const lastRun = new Date().toISOString();

    await this.schedule.updateSchedule(id, { lastRun });

    this.events.publish({
      type: 'ScheduleUpdate',
      scheduleId: id,
      schedule: { lastRun },
    });

    if (repositories.length === 0) {
      return;
    }

    this.runningTasks.startTask(id, TaskType.Schedule);

    const scheduleStatus: ActiveScheduleItemDto[] = [];

    for (const repositoryId of repositories) {
      try {
        scheduleStatus.push({ repositoryId, status: TaskStatus.Incomplete });
        this.runningTasks.updateTask(id, { scheduleStatus });

        const { task } = await this.repository.createBackup(repositoryId);
        await task;

        scheduleStatus.splice(-1, 1, { repositoryId, status: TaskStatus.Complete });
        this.runningTasks.updateTask(id, { scheduleStatus });
      } catch {
        scheduleStatus.splice(-1, 1, { repositoryId, status: TaskStatus.Failed });
        this.runningTasks.updateTask(id, { scheduleStatus });
      }
    }

    this.runningTasks.endTask(id);

    const lastFinished = new Date().toISOString();

    await this.schedule.updateSchedule(id, { lastFinished });

    this.events.publish({
      type: 'ScheduleUpdate',
      scheduleId: id,
      schedule: { lastFinished },
    });
  }

  async createSchedule({ repositories, ...dto }: ScheduleCreateRequestDto): Promise<ScheduleCreateResponseDto> {
    const id = randomUUID();

    const { ordering: _, ...model } = await this.schedule.create({
      id,
      paused: 0,
      ordering: JSON.stringify([]),
      ...dto,
    });

    for (const repository of repositories) {
      await this.schedule.addRepositoryToSchedule(id, repository);
    }

    const schedule = {
      ...model,
      paused: false,
      repositories,
    };

    this.events.publish({
      type: 'ScheduleCreate',
      schedule,
    });

    this.createCronJob(id, dto.cron, false);

    return {
      schedule,
    };
  }

  async getSchedules(): Promise<ScheduleListResponseDto> {
    return {
      schedules: await this.schedule.getAll(),
    };
  }

  async updateSchedule(
    scheduleId: string,
    { name, paused, cron, repositories }: ScheduleUpdateRequestDto,
  ): Promise<ScheduleUpdateResponseDto> {
    const linked = new Set(await this.schedule.getRepositoryIds(scheduleId));

    const set: Updateable<ScheduleTable> = {
      name,
      cron,
    };

    if (typeof paused === 'boolean') {
      set.paused = paused ? 1 : 0;
    }

    if (Array.isArray(repositories)) {
      set.ordering = JSON.stringify(repositories.filter((id) => linked.has(id)));
    }

    await this.schedule.updateSchedule(scheduleId, set);

    const schedule = await this.schedule.get(scheduleId);

    this.events.publish({
      type: 'ScheduleUpdate',
      scheduleId,
      schedule,
    });

    this.updateCronJob(scheduleId, schedule.cron, schedule.paused);

    return {
      schedule,
    };
  }

  async removeSchedule(scheduleId: string): Promise<void> {
    const integration = await this.integrationImmich.get();
    if (integration?.scheduleId === scheduleId) {
      throw new BadRequestException('Schedule managed by Immich integration');
    }

    await this.schedule.removeSchedule(scheduleId);

    this.events.publish({
      type: 'ScheduleDelete',
      scheduleId,
    });
  }

  async addRepositoryToSchedule(scheduleId: string, repositoryId: string): Promise<void> {
    await this.schedule.addRepositoryToSchedule(scheduleId, repositoryId);

    this.events.publish({
      type: 'ScheduleUpdate',
      scheduleId,
      schedule: await this.schedule.get(scheduleId),
    });
  }

  async removeRepositoryFromSchedule(scheduleId: string, repositoryId: string): Promise<void> {
    await this.schedule.removeRepositoryFromSchedule(scheduleId, repositoryId);

    this.events.publish({
      type: 'ScheduleUpdate',
      scheduleId,
      schedule: await this.schedule.get(scheduleId),
    });
  }
}
