import { Column, ForeignKeyColumn, type Generated, Table } from '@immich/sql-tools';
import { UserAllowlistTable } from './userAllowlist.table';

@Table({ name: 'discordLinkRequests' })
export class DiscordLinkRequestTable {
  @Column({ primary: true, type: 'uuid', default: () => 'gen_random_uuid()' })
  id!: Generated<string>;

  @Column({ unique: true })
  code!: string;

  @ForeignKeyColumn(() => UserAllowlistTable, {
    onUpdate: 'CASCADE',
    onDelete: 'CASCADE',
    nullable: true,
    index: false,
  })
  allowlistId!: string | null;

  @Column()
  discordUserId!: string;

  @Column()
  discordUsername!: string;

  @Column({ type: 'timestamp with time zone' })
  expiresAt!: Date;

  @Column({ type: 'timestamp with time zone', default: () => 'now()' })
  createdAt!: Generated<Date>;
}
