import { Database } from '@immich/sql-tools';
import { RepositoryTable } from './tables/repository.table';
import { RepositoryMetricsTable } from './tables/repositoryMetrics.table';
import { RepositoryMetricsHistoryTable } from './tables/repositoryMetricsHistory.table';
import { SessionTable } from './tables/session.table';
import { UserTable } from './tables/user.table';

@Database({ name: 'yucca' })
export class ImmichDatabase {
  tables = [SessionTable, UserTable, RepositoryTable, RepositoryMetricsTable, RepositoryMetricsHistoryTable];

  functions = [];

  enum = [];
}

export interface DB {
  users: UserTable;
  sessions: SessionTable;
  repositories: RepositoryTable;
  repositoryMetrics: RepositoryMetricsTable;
  repositoryMetricsHistory: RepositoryMetricsHistoryTable;
}
