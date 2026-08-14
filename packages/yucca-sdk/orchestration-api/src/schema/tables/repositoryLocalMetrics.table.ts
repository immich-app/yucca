import { TaskStatus } from '../../enum';

export class RepositoryLocalMetricsTable {
  id!: string;

  sizeBytes!: number;
  lastBackup?: string;
  lastBackupStatus?: TaskStatus;
  lastBackupDuration?: number;
}
