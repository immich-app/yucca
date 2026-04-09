import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigRepository } from '../repositories/config.repository';
import { DatabaseRepository } from '../repositories/database.repository';
import { ScheduleService } from './schedule.service';

@Injectable()
export class DatabaseService implements OnApplicationBootstrap {
  constructor(
    private readonly repository: DatabaseRepository,
    private readonly config: ConfigRepository,
    private readonly schedule: ScheduleService,
  ) {}

  async onApplicationBootstrap() {
    await this.repository.runMigrations();
    await this.config.bootstrap();
    await this.schedule.bootstrap();
  }
}
