import { Database } from '@immich/sql-tools';
import { ConsumerTable } from './tables/consumer.table';
import { RepositoryTable } from './tables/repository.table';
import { RepositoryMeterTable } from './tables/repositoryMeter.table';
import { RepositoryMeterHistoryTable } from './tables/repositoryMeterHistory.table';
import { RepositoryMetricsTable } from './tables/repositoryMetrics.table';
import { RepositoryMetricsHistoryTable } from './tables/repositoryMetricsHistory.table';
import { ResticTokenTable } from './tables/resticToken.table';
import { SessionTable } from './tables/session.table';
import { UserTable } from './tables/user.table';
import { UserAllowlistTable } from './tables/userAllowlist.table';
import { UserFeatureFlagOverrideTable } from './tables/userFeatureFlagOverride.table';

@Database({ name: 'yucca' })
export class ImmichDatabase {
  tables = [
    SessionTable,
    UserTable,
    ConsumerTable,
    RepositoryTable,
    RepositoryMetricsTable,
    RepositoryMetricsHistoryTable,
    RepositoryMeterTable,
    RepositoryMeterHistoryTable,
    ResticTokenTable,
    UserAllowlistTable,
    UserFeatureFlagOverrideTable,
  ];

  functions = [];

  enum = [];
}

export interface DB {
  users: UserTable;
  sessions: SessionTable;
  consumers: ConsumerTable;
  repositories: RepositoryTable;
  repositoryMetrics: RepositoryMetricsTable;
  repositoryMetricsHistory: RepositoryMetricsHistoryTable;
  repositoryMeter: RepositoryMeterTable;
  repositoryMeterHistory: RepositoryMeterHistoryTable;
  resticTokens: ResticTokenTable;
  userAllowlist: UserAllowlistTable;
  userFeatureFlagOverride: UserFeatureFlagOverrideTable;
}
