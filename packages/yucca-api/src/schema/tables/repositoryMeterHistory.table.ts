import { Column, ForeignKeyColumn, type Generated, Table } from '@immich/sql-tools';
import { RepositoryTable } from './repository.table';

@Table({ name: 'repositoryMeterHistory' })
export class RepositoryMeterHistoryTable {
  @Column({ primary: true, type: 'uuid', default: () => 'gen_random_uuid()' })
  id!: Generated<string>;

  @ForeignKeyColumn(() => RepositoryTable, { onUpdate: 'CASCADE', onDelete: 'CASCADE' })
  repositoryId!: string;

  @Column({ type: 'bigint' })
  sizeBytes!: number;

  @Column({ type: 'bigint' })
  objectCount!: number;

  @Column({ type: 'text' })
  storageClusterCode!: string;

  @Column({ type: 'timestamp with time zone', default: () => 'now()' })
  timestamp!: Generated<Date>;
}
