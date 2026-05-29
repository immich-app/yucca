import { Column, ForeignKeyColumn, type Generated, Table } from '@immich/sql-tools';
import { RepositoryTable } from './repository.table';

@Table({ name: 'repositoryMetricsHistory' })
export class RepositoryMetricsHistoryTable {
  @Column({ primary: true, type: 'uuid', default: () => 'gen_random_uuid()' })
  id!: Generated<string>;

  @ForeignKeyColumn(() => RepositoryTable, { onUpdate: 'CASCADE', onDelete: 'CASCADE' })
  repositoryId!: string;

  @Column({ type: 'timestamp with time zone', default: () => 'now()' })
  createdAt!: Generated<Date>;

  @Column({ type: 'bigint', nullable: true })
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
