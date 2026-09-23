import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { BootstrapRepository } from '../repositories/bootstrap.repository';
import { ConfigRepository } from '../repositories/config.repository';
import { DatabaseRepository } from '../repositories/database.repository';
import { LoggingRepository } from '../repositories/logging.repository';
import { ModuleConfigRepository } from '../repositories/moduleConfig.repository';
import { discardStateCacheDirectory } from '../utils/cache';
import { ConfigService } from './config.service';
import { RunHistoryService } from './runHistory.service';
import { ScheduleService } from './schedule.service';

@Injectable()
export class BootstrapService implements OnApplicationBootstrap {
  constructor(
    private readonly logger: LoggingRepository,
    private readonly database: DatabaseRepository,
    private readonly config: ConfigRepository,
    private readonly configService: ConfigService,
    private readonly schedule: ScheduleService,
    private readonly bootstrap: BootstrapRepository,
    private readonly runHistory: RunHistoryService,
    private readonly moduleConfig: ModuleConfigRepository,
  ) {
    this.logger.setContext(BootstrapService.name);
  }

  async onApplicationBootstrap() {
    try {
      if (this.moduleConfig.hasLock()) {
        await discardStateCacheDirectory(this.moduleConfig.get());
      }

      await this.database.runMigrations();
      await this.config.bootstrap();
      await this.configService.bootstrap();
      await this.schedule.bootstrap();
      await this.runHistory.reconcileInterruptedRuns();

      const { backends, repositories, activeSchedules } = await this.config.getStateSummary();
      this.logger.log('Successfully finished FUTO Backups bootstrap.');
      this.logger.log(
        `Found ${backends} ${backends === 1 ? 'backend' : 'backends'}, ${repositories} ${repositories === 1 ? 'repository' : 'repositories'}, and ${activeSchedules} active ${activeSchedules === 1 ? 'schedule' : 'schedules'}.`,
      );

      this.bootstrap.markReady();
    } catch (error) {
      this.logger.error('Failed to initialise FUTO Backups with cause:', error);
      this.bootstrap.markFailed(error);
    }
  }
}
