import { Column, ForeignKeyColumn, type Generated, Table } from '@immich/sql-tools';
import { UserTable } from './user.table';

@Table({ name: 'consumers' })
export class ConsumerTable {
  @Column({ primary: true, type: 'uuid', default: () => 'gen_random_uuid()' })
  id!: Generated<string>;

  @ForeignKeyColumn(() => UserTable, { onUpdate: 'CASCADE', onDelete: 'CASCADE', index: true })
  userId!: string;

  // One of ConsumerTypes (@common/server) — validated app-side, not a DB enum.
  @Column()
  type!: string;

  @Column()
  name!: string;

  @Column({ type: 'timestamp with time zone', default: () => 'now()' })
  createdAt!: Generated<Date>;

  @Column({ type: 'timestamp with time zone', nullable: true })
  lastSeenAt!: Date | null;
}
