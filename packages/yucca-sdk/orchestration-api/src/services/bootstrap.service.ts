import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { BootstrapRepository } from '../repositories/bootstrap.repository';
import { ConfigRepository } from '../repositories/config.repository';
import { DatabaseRepository } from '../repositories/database.repository';
import { RunHistoryService } from './runHistory.service';
import { ScheduleService } from './schedule.service';

@Injectable()
export class BootstrapService implements OnApplicationBootstrap {
  constructor(
    private readonly database: DatabaseRepository,
    private readonly config: ConfigRepository,
    private readonly schedule: ScheduleService,
    private readonly bootstrap: BootstrapRepository,
    private readonly runHistory: RunHistoryService,
  ) {}

  async onApplicationBootstrap() {
    try {
      await this.database.runMigrations();
      await this.config.bootstrap();
      await this.schedule.bootstrap();
      await this.runHistory.reconcileInterruptedRuns();

      this.bootstrap.markReady();
    } catch (error) {
      this.bootstrap.markFailed(error);
    }
  }
}
