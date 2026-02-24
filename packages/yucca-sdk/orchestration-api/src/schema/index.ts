import { BackendTable } from './tables/backend.table';
import { ConfigTable } from './tables/config.table';
import { RepositoryTable } from './tables/repository.table';
import { RepositoryLocalMetricsTable } from './tables/repositoryLocalMetrics.table';
import { RepositoryPathTable } from './tables/repositoryPath.table';
import { RunHistoryTable } from './tables/runHistory.table';

export interface DB {
  backends: BackendTable;
  config: ConfigTable;
  repositories: RepositoryTable;
  repositoryPaths: RepositoryPathTable;
  repositoryLocalMetrics: RepositoryLocalMetricsTable;
  runHistory: RunHistoryTable;
}
