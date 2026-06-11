import { BadRequestException, forwardRef, Inject, Injectable } from '@nestjs/common';
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
import { TelemetryService } from './telemetry.service';

@Injectable()
export class ScheduleService {
  constructor(
    @Inject(forwardRef(() => RepositoryService))
    private readonly repository: RepositoryService,
    private readonly events: EventsGateway,
    private readonly schedule: ScheduleRepository,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly runningTasks: RunningTasksRepository,
    private readonly moduleConfig: ModuleConfigRepository,
    private readonly integrationImmich: RepositoryIntegrationImmichRepository,
    private readonly telemetry: TelemetryService,
  ) {}

  private readonly cronJobs = new Set<string>();

  async bootstrap() {
    for (const id of this.cronJobs) {
      this.schedulerRegistry.deleteCronJob(id);
    }

    this.cronJobs.clear();

    for (const schedule of await this.schedule.getAll()) {
      this.createCronJob(schedule.id, schedule.cron, schedule.paused);
    }
  }

  private createCronJob(id: string, cron: string, paused: boolean): void {
    this.cronJobs.add(id);
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

    this.telemetry.submitStructuredLog(`Running schedule for ${repositories.length} repositories`, {
      scheduleId: id,
      lastRun,
      repositories,
    });

    await this.schedule.updateSchedule(id, { lastRun });

    this.events.publish({
      type: 'ScheduleUpdate',
      scheduleId: id,
      schedule: { lastRun },
    });

    if (repositories.length === 0) {
      return;
    }

    const scheduleSignal = this.runningTasks.startTask(id, TaskType.Schedule);

    const scheduleStatus: ActiveScheduleItemDto[] = repositories.map((repositoryId) => ({
      repositoryId,
      status: TaskStatus.Incomplete,
    }));

    this.runningTasks.updateTask(id, { scheduleStatus });

    for (const [index, repositoryId] of repositories.entries()) {
      if (scheduleSignal.aborted) {
        break;
      }

      try {
        const { task } = await this.repository.createBackup(repositoryId, scheduleSignal);
        await task;

        scheduleStatus[index] = { repositoryId, status: TaskStatus.Complete };
        this.runningTasks.updateTask(id, { scheduleStatus });
      } catch {
        scheduleStatus[index] = { repositoryId, status: TaskStatus.Failed };
        this.runningTasks.updateTask(id, { scheduleStatus });
      }
    }

    this.runningTasks.endTask(id);

    const lastFinished = new Date().toISOString();

    await this.schedule.updateSchedule(id, { lastFinished });

    this.telemetry.submitStructuredLog(`Finished running schedule for ${repositories.length} repositories`, {
      scheduleId: id,
      lastFinished,
      scheduleStatus,
    });

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

    this.telemetry.submitStructuredLog(`Created schedule for ${repositories.length} repositories`, {
      scheduleId: id,
      repositories,
    });

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

  async updateSchedule(scheduleId: string, dto: ScheduleUpdateRequestDto): Promise<ScheduleUpdateResponseDto> {
    const integration = await this.integrationImmich.get();
    if (integration?.scheduleId === scheduleId && !(typeof dto.paused === 'boolean' && Object.keys(dto).length === 1)) {
      throw new BadRequestException('Schedule managed by Immich integration');
    }

    return this.applyScheduleUpdate(scheduleId, dto);
  }

  async applyScheduleUpdate(
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
      const incoming = new Set(repositories);
      const toAdd = repositories.filter((id) => !linked.has(id));
      const toRemove = [...linked].filter((id) => !incoming.has(id));

      for (const id of toAdd) {
        await this.schedule.addRepositoryToSchedule(scheduleId, id);
      }

      for (const id of toRemove) {
        await this.schedule.removeRepositoryFromSchedule(scheduleId, id);
      }

      set.ordering = JSON.stringify(repositories);
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
    this.schedulerRegistry.deleteCronJob(scheduleId);
    this.cronJobs.delete(scheduleId);

    this.telemetry.submitStructuredLog(`Deleted schedule`, {
      scheduleId,
    });

    this.events.publish({
      type: 'ScheduleDelete',
      scheduleId,
    });
  }
}
