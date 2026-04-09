export type ImmichRepositoryConfig = {
  dataFolders: string[];
  backupConfiguration: boolean;
  libraries: 'all' | string[];
};

export class RepositoryIntegrationImmichTable {
  id!: string;

  scheduleId!: string;

  configuration!: string;
}
