import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ScheduleCreateRequestDto, ScheduleCreateResponseDto, ScheduleListResponseDto } from '../dto/schedule.dto';
import { EventsGateway } from '../events/events.gateway';
import { ScheduleRepository } from '../repositories/schedule.repository';

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

  async removeSchedule(id: string): Promise<void> {
    await this.schedule.removeSchedule(id);
  }

  async addRepositoryToSchedule(id: string, repositoryId: string): Promise<void> {
    await this.schedule.addRepositoryToSchedule(id, repositoryId);
  }

  async removeRepositoryFromSchedule(id: string, repositoryId: string): Promise<void> {
    await this.schedule.removeRepositoryFromSchedule(id, repositoryId);
  }
}
