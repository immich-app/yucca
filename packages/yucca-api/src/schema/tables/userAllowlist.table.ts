import { Column, ForeignKeyColumn, type Generated, Table } from '@immich/sql-tools';
import { DiscordInviteBatchTable } from './discordInviteBatch.table';

@Table({ name: 'userAllowlist' })
export class UserAllowlistTable {
  @Column({ primary: true, type: 'uuid', default: () => 'gen_random_uuid()' })
  id!: Generated<string>;

  @Column({ unique: true, nullable: true })
  email!: string | null;

  @Column({ unique: true })
  inviteCode!: string;

  @Column({ type: 'boolean', default: () => 'false' })
  invited!: Generated<boolean>;

  @Column({ type: 'boolean', default: () => 'false' })
  inviteUsed!: Generated<boolean>;

  @Column({ type: 'timestamp with time zone', nullable: true })
  inviteUsedAt!: Date | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  inviteEmailSentAt!: Date | null;

  @Column({ unique: true, nullable: true })
  discordUserId!: string | null;

  @ForeignKeyColumn(() => DiscordInviteBatchTable, {
    onUpdate: 'CASCADE',
    onDelete: 'SET NULL',
    nullable: true,
    index: false,
  })
  batchId!: string | null;

  @Column({ type: 'timestamp with time zone', default: () => 'now()' })
  createdAt!: Generated<Date>;
}
