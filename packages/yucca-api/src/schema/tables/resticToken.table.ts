import { Column, ForeignKeyColumn, type Generated, Table } from '@immich/sql-tools';
import { ConnectionTable } from './connection.table';
import { RepositoryTable } from './repository.table';
import { UserTable } from './user.table';

// One row per minted restic JWT: the audit of live credentials and the source
// of truth for revocation (revoked rows are mirrored into Redis for michael).
@Table({ name: 'resticTokens' })
export class ResticTokenTable {
  // The JWT's jti claim — minted by the API, so no DB default.
  @Column({ primary: true, type: 'uuid' })
  jti!: string;

  @ForeignKeyColumn(() => RepositoryTable, { onUpdate: 'CASCADE', onDelete: 'CASCADE', index: true })
  repositoryId!: string;

  @ForeignKeyColumn(() => UserTable, { onUpdate: 'CASCADE', onDelete: 'CASCADE', index: true })
  userId!: string;

  @ForeignKeyColumn(() => ConnectionTable, { onUpdate: 'CASCADE', onDelete: 'SET NULL', nullable: true, index: true })
  connectionId!: string | null;

  // 'user' (self-service mint via yucca-api) or 'admin' (yucca-admin-api).
  @Column()
  mintedBy!: string;

  @Column({ nullable: true })
  label!: string | null;

  @Column({ type: 'timestamp with time zone', index: true })
  expiresAt!: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  revokedAt!: Date | null;

  @Column({ nullable: true })
  revokedBy!: string | null;

  @Column({ type: 'timestamp with time zone', default: () => 'now()' })
  createdAt!: Generated<Date>;
}
