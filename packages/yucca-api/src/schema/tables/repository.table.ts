import { Column, ForeignKeyColumn, type Generated, Table } from '@immich/sql-tools';
import { ConnectionTable } from './connection.table';
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

  @Column({ type: 'text' })
  siteCode!: string;

  @Column({ type: 'text' })
  storageClusterCode!: string;

  @ForeignKeyColumn(() => ConnectionTable, { onUpdate: 'CASCADE', onDelete: 'RESTRICT', index: true })
  connectionId!: string;

  @Column({ type: 'text', nullable: true })
  storageAccessKeyId!: string | null;

  // Sealed with STORAGE_CREDENTIAL_KEY, never the key michael holds: a database
  // dump is not enough to reach the bucket.
  @Column({ type: 'text', nullable: true })
  storageSecretAccessKey!: string | null;
}
