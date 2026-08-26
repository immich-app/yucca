import { Database } from '@immich/sql-tools';
import { ConnectionTable } from './tables/connection.table';
import { ConnectionMetricsTable } from './tables/connectionMetrics.table';
import { DiscordInviteBatchTable } from './tables/discordInviteBatch.table';
import { DiscordLinkTable } from './tables/discordLink.table';
import { DiscordLinkRequestTable } from './tables/discordLinkRequest.table';
import { RepositoryTable } from './tables/repository.table';
import { RepositoryMeterTable } from './tables/repositoryMeter.table';
import { RepositoryMeterHistoryTable } from './tables/repositoryMeterHistory.table';
import { RepositoryMetricsTable } from './tables/repositoryMetrics.table';
import { RepositoryMetricsHistoryTable } from './tables/repositoryMetricsHistory.table';
import { SessionTable } from './tables/session.table';
import { SettingsTable } from './tables/settings.table';
import { UserTable } from './tables/user.table';
import { UserAllowlistTable } from './tables/userAllowlist.table';
import { UserFeatureFlagOverrideTable } from './tables/userFeatureFlagOverride.table';

@Database({ name: 'yucca' })
export class ImmichDatabase {
  tables = [
    SessionTable,
    UserTable,
    ConnectionTable,
    ConnectionMetricsTable,
    RepositoryTable,
    RepositoryMetricsTable,
    RepositoryMetricsHistoryTable,
    RepositoryMeterTable,
    RepositoryMeterHistoryTable,
    UserAllowlistTable,
    SettingsTable,
    UserFeatureFlagOverrideTable,
    DiscordLinkTable,
    DiscordLinkRequestTable,
    DiscordInviteBatchTable,
  ];

  functions = [];

  enum = [];
}

export interface DB {
  users: UserTable;
  sessions: SessionTable;
  connections: ConnectionTable;
  connectionMetrics: ConnectionMetricsTable;
  repositories: RepositoryTable;
  repositoryMetrics: RepositoryMetricsTable;
  repositoryMetricsHistory: RepositoryMetricsHistoryTable;
  repositoryMeter: RepositoryMeterTable;
  repositoryMeterHistory: RepositoryMeterHistoryTable;
  userAllowlist: UserAllowlistTable;
  settings: SettingsTable;
  userFeatureFlagOverride: UserFeatureFlagOverrideTable;
  discordLinks: DiscordLinkTable;
  discordLinkRequests: DiscordLinkRequestTable;
  discordInviteBatches: DiscordInviteBatchTable;
}
