import { Column, ForeignKeyColumn, type Generated, Table } from '@immich/sql-tools';
import { ConnectionTable } from './connection.table';
import { UserTable } from './user.table';

@Table({ name: 'sessions' })
export class SessionTable {
  @Column({ primary: true, type: 'uuid', default: () => 'gen_random_uuid()' })
  id!: Generated<string>;

  @ForeignKeyColumn(() => UserTable, { onUpdate: 'CASCADE', onDelete: 'CASCADE' })
  userId!: string;

  @Column({ index: true, unique: true })
  accessToken!: string;

  // The connection instance this session authenticates (device-flow logins).
  // Null for web logins and for sessions predating the connection model.
  @ForeignKeyColumn(() => ConnectionTable, { onUpdate: 'CASCADE', onDelete: 'CASCADE', nullable: true, index: true })
  connectionId!: string | null;

  // 'web' | 'device'; null for sessions predating the discriminator.
  @Column({ nullable: true })
  kind!: string | null;
}
