import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigRepository } from '../repositories/config.repository';
import { DatabaseRepository } from '../repositories/database.repository';
import { RunHistoryRepository } from '../repositories/runHistory.repository';
import { ScheduleService } from './schedule.service';

@Injectable()
export class BootstrapService implements OnApplicationBootstrap {
  constructor(
    private readonly database: DatabaseRepository,
    private readonly config: ConfigRepository,
    private readonly schedule: ScheduleService,
    private readonly runHistoryRepository: RunHistoryRepository,
  ) {}

  async onApplicationBootstrap() {
    await this.database.runMigrations();
    await this.config.bootstrap();
    await this.schedule.bootstrap();
    await this.runHistoryRepository.markIncompleteAsFailed();
  }
}
