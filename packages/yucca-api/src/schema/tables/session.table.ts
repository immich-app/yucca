import { Column, ForeignKeyColumn, type Generated, Table } from '@immich/sql-tools';
import { UserTable } from './user.table';

@Table({ name: 'sessions' })
export class SessionTable {
  @Column({ primary: true, type: 'uuid', default: () => 'gen_random_uuid()' })
  id!: Generated<string>;

  @ForeignKeyColumn(() => UserTable, { onUpdate: 'CASCADE', onDelete: 'CASCADE' })
  userId!: string;

  @Column({ index: true, unique: true })
  accessToken!: string;
}
