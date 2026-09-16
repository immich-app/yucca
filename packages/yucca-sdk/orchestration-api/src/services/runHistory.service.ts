import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { TaskStatus, TaskType } from '../enum';
import { BackendRepository } from '../repositories/backend.repository';
import { RepositoryRepository } from '../repositories/repository.repository';
import { RunHistoryRepository } from '../repositories/runHistory.repository';
import { TelemetryService } from './telemetry.service';

@Injectable()
export class RunHistoryService {
  constructor(
    private readonly runHistory: RunHistoryRepository,
    private readonly repository: RepositoryRepository,
    private readonly backend: BackendRepository,
    private readonly telemetry: TelemetryService,
  ) {}

  observableLog(id: string): Observable<MessageEvent> {
    return this.runHistory.getObservable(id);
  }

  async reconcileInterruptedRuns() {
    const runs = await this.runHistory.markIncompleteAsFailed();

    for (const run of runs) {
      if (run.type === TaskType.Backup) {
        const repositoryId = run.repositoryId;

        try {
          this.telemetry.submitStructuredLog('Backup finished', {
            repositoryId,
            lastBackupStatus: TaskStatus.Failed,
            error: 'Interrupted before it could report a result, reconciled at startup',
          });

          const repository = await this.repository.get(repositoryId);
          if (!repository) {
            return;
          }

          const result = await this.backend.getBackend(repository.backendId);
          if (result?.backend.isMetricsCapable()) {
            result.backend.submitMetricBackupEnd(repository.remoteId, TaskStatus.Failed, Date.now() - +new Date(run.start));
          }
        } catch (error) {
          this.telemetry.submitStructuredLog('Failed to finalise interrupted backup', {
            repositoryId,
            error,
          });
        }
      }
    }
  }
}
