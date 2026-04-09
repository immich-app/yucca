export class RepositoryLocalMetricsTable {
  id!: string;

  sizeBytes!: number;
  lastBackup?: string;
  lastSuccessfulBackup?: string;
  lastBackupDuration?: number;
}
