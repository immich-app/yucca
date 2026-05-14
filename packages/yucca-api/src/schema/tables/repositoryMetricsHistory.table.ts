import { Column, ForeignKeyColumn, Table } from '@immich/sql-tools';
import { RepositoryTable } from './repository.table';

@Table({ name: 'repositoryMetricsHistory' })
export class RepositoryMetricsTable {
  id!: string;

  @ForeignKeyColumn(() => RepositoryTable, { primary: true, onUpdate: 'CASCADE', onDelete: 'CASCADE' })
  repositoryId!: string;

  @Column({ type: 'bigint', nullable: false })
  sizeBytes?: number;

  @Column({ type: 'timestamp with time zone', nullable: true })
  started?: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  backup?: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  successfulBackup?: Date;

  @Column({ type: 'integer', nullable: true })
  backupDuration?: number;
}
