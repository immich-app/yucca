import { Injectable } from '@nestjs/common';
import { Updateable } from 'kysely';
import { randomUUID } from 'node:crypto';
import {
  ScheduleCreateRequestDto,
  ScheduleCreateResponseDto,
  ScheduleListResponseDto,
  ScheduleUpdateRequestDto,
  ScheduleUpdateResponseDto,
} from '../dto/schedule.dto';
import { EventsGateway } from '../events/events.gateway';
import { ScheduleRepository } from '../repositories/schedule.repository';
import { ScheduleTable } from '../schema/tables/schedule.table';

@Injectable()
export class ScheduleService {
  constructor(
    private readonly events: EventsGateway,
    private readonly schedule: ScheduleRepository,
  ) {}

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
    const linked = new Set(await this.schedule.getRepositories(scheduleId));

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

    return {
      schedule,
    };
  }

  async removeSchedule(scheduleId: string): Promise<void> {
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
