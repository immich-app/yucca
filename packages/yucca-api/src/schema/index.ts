import { Database } from '@immich/sql-tools';
import { RepositoryTable } from './tables/repository.table';
import { RepositoryMeterTable } from './tables/repositoryMeter.table';
import { RepositoryMeterHistoryTable } from './tables/repositoryMeterHistory.table';
import { RepositoryMetricsTable } from './tables/repositoryMetrics.table';
import { RepositoryMetricsHistoryTable } from './tables/repositoryMetricsHistory.table';
import { SessionTable } from './tables/session.table';
import { UserTable } from './tables/user.table';
import { UserAllowlistTable } from './tables/userAllowlist.table';

@Database({ name: 'yucca' })
export class ImmichDatabase {
  tables = [
    SessionTable,
    UserTable,
    RepositoryTable,
    RepositoryMetricsTable,
    RepositoryMetricsHistoryTable,
    RepositoryMeterTable,
    RepositoryMeterHistoryTable,
    UserAllowlistTable,
  ];

  functions = [];

  enum = [];
}

export interface DB {
  users: UserTable;
  sessions: SessionTable;
  repositories: RepositoryTable;
  repositoryMetrics: RepositoryMetricsTable;
  repositoryMetricsHistory: RepositoryMetricsHistoryTable;
  repositoryMeter: RepositoryMeterTable;
  repositoryMeterHistory: RepositoryMeterHistoryTable;
  userAllowlist: UserAllowlistTable;
}
