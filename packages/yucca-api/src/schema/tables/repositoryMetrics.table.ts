import { Column, ForeignKeyColumn, Table } from '@immich/sql-tools';
import { RepositoryTable } from './repository.table';

@Table({ name: 'repositoryMetrics' })
export class RepositoryMetricsTable {
  @ForeignKeyColumn(() => RepositoryTable, { primary: true, onUpdate: 'CASCADE', onDelete: 'CASCADE' })
  id!: string;

  @Column({ type: 'bigint' })
  sizeBytes!: number;

  @Column({ type: 'timestamp with time zone', nullable: true })
  lastStarted?: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  lastBackup?: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  lastSuccessfulBackup?: Date;

  @Column({ type: 'integer', nullable: true })
  lastBackupDuration?: number;
}
