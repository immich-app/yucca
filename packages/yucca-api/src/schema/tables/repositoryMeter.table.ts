import { Column, ForeignKeyColumn, type Generated, Table } from '@immich/sql-tools';
import { RepositoryTable } from './repository.table';

@Table({ name: 'repositoryMeter' })
export class RepositoryMeterTable {
  @ForeignKeyColumn(() => RepositoryTable, { primary: true, onUpdate: 'CASCADE', onDelete: 'CASCADE' })
  repositoryId!: string;

  @Column({ type: 'bigint' })
  sizeBytes!: number;

  @Column({ type: 'bigint' })
  objectCount!: number;

  @Column({ type: 'text', default: 'local-dev' })
  storageClusterCode!: string;

  @Column({ type: 'timestamp with time zone', default: () => 'now()' })
  timestamp!: Generated<Date>;
}
