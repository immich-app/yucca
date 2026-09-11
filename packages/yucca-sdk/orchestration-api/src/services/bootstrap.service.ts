import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Selectable } from 'kysely';
import { TaskStatus, TaskType } from '../enum';
import { BackendRepository } from '../repositories/backend.repository';
import { BootstrapRepository } from '../repositories/bootstrap.repository';
import { ConfigRepository } from '../repositories/config.repository';
import { DatabaseRepository } from '../repositories/database.repository';
import { RepositoryRepository } from '../repositories/repository.repository';
import { RunHistoryRepository } from '../repositories/runHistory.repository';
import { RunHistoryTable } from '../schema/tables/runHistory.table';
import { ScheduleService } from './schedule.service';
import { TelemetryService } from './telemetry.service';

const INTERRUPTED_ERROR = 'Interrupted before it could report a result, reconciled at startup';

@Injectable()
export class BootstrapService implements OnApplicationBootstrap {
  constructor(
    private readonly database: DatabaseRepository,
    private readonly config: ConfigRepository,
    private readonly schedule: ScheduleService,
    private readonly runHistoryRepository: RunHistoryRepository,
    private readonly bootstrap: BootstrapRepository,
    private readonly repository: RepositoryRepository,
    private readonly backend: BackendRepository,
    private readonly telemetry: TelemetryService,
  ) {}

  async onApplicationBootstrap() {
    try {
      await this.database.runMigrations();
      await this.config.bootstrap();
      await this.schedule.bootstrap();
      await this.reconcileInterruptedRuns();

      this.bootstrap.markReady();
    } catch (error) {
      this.bootstrap.markFailed(error);
    }
  }

  private async reconcileInterruptedRuns() {
    const runs = await this.runHistoryRepository.markIncompleteAsFailed();

    for (const run of runs) {
      if (run.type === TaskType.Backup) {
        await this.reportInterruptedBackup(run);
      }
    }
  }

  private async reportInterruptedBackup(run: Selectable<RunHistoryTable>) {
    const repositoryId = run.repositoryId;

    try {
      this.telemetry.submitStructuredLog('Backup finished', {
        repositoryId,
        lastBackupStatus: TaskStatus.Failed,
        error: INTERRUPTED_ERROR,
      });

      const repository = await this.repository.get(repositoryId);
      if (!repository) {
        return;
      }

      const result = await this.backend.getBackend(repository.backendId);
      if (result?.backend.isMetricsCapable()) {
        result.backend.submitMetricBackupEnd(repository.remoteId, false, Date.now() - +new Date(run.start));
      }
    } catch (error) {
      this.telemetry.submitStructuredLog('Failed to finalise interrupted backup', {
        repositoryId,
        error,
      });
    }
  }
}
