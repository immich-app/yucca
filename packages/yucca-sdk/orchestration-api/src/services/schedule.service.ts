import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ScheduleCreateRequestDto, ScheduleCreateResponseDto, ScheduleListResponseDto } from '../dto/schedule.dto';
import { ScheduleRepository } from '../repositories/schedule.repository';

@Injectable()
export class ScheduleService {
  constructor(private readonly schedule: ScheduleRepository) {}

  async createSchedule(dto: ScheduleCreateRequestDto): Promise<ScheduleCreateResponseDto> {
    const { ordering: _, ...schedule } = await this.schedule.create({
      id: randomUUID(),
      paused: false,
      ordering: JSON.stringify([]),
      ...dto,
    });

    return {
      schedule: {
        ...schedule,
        repositories: [],
      },
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
