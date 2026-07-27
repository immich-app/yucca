import { Column, ForeignKeyColumn, type Generated, Table } from '@immich/sql-tools';
import { ConsumerTable } from './consumer.table';
import { UserTable } from './user.table';

@Table({ name: 'repositories' })
export class RepositoryTable {
  @Column({ primary: true, type: 'uuid', default: () => 'gen_random_uuid()' })
  id!: Generated<string>;

  @ForeignKeyColumn(() => UserTable, { onUpdate: 'RESTRICT', onDelete: 'RESTRICT' })
  userId!: string;

  @Column({ type: 'boolean' })
  worm!: boolean;

  @Column({ type: 'text' })
  name!: string;

  // The consumer instance that owns this repository. RESTRICT: a consumer
  // with repositories cannot be deleted; re-parent (adopt) or delete first.
  @ForeignKeyColumn(() => ConsumerTable, { onUpdate: 'CASCADE', onDelete: 'RESTRICT', index: true })
  consumerId!: string;
}
