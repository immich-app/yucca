import { BackendTable } from './tables/backend.table';
import { ConfigTable } from './tables/config.table';
import { RepositoryTable } from './tables/repository.table';
import { RepositoryLocalMetricsTable } from './tables/repositoryLocalMetrics.table';
import { RepositoryPathTable } from './tables/repositoryPath.table';
import { RepositoryScheduleTable } from './tables/repositorySchedule.table';
import { RepositoryIntegrationImmichTable } from './tables/repositoryIntegrationImmich.table';
import { RunHistoryTable } from './tables/runHistory.table';
import { ScheduleTable } from './tables/schedule.table';

export interface DB {
  backends: BackendTable;
  config: ConfigTable;
  repositories: RepositoryTable;
  repositoryIntegrationImmich: RepositoryIntegrationImmichTable;
  repositoryPaths: RepositoryPathTable;
  repositorySchedules: RepositoryScheduleTable;
  repositoryLocalMetrics: RepositoryLocalMetricsTable;
  runHistory: RunHistoryTable;
  schedules: ScheduleTable;
}
