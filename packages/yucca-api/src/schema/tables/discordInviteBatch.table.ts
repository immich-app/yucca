import { Column, type Generated, Table } from '@immich/sql-tools';

@Table({ name: 'discordInviteBatches' })
export class DiscordInviteBatchTable {
  @Column({ primary: true, type: 'uuid', default: () => 'gen_random_uuid()' })
  id!: Generated<string>;

  @Column()
  guildId!: string;

  @Column()
  channelId!: string;

  @Column({ nullable: true })
  messageId!: string | null;

  @Column({ type: 'integer' })
  maxClaims!: number;

  @Column()
  createdByDiscordUserId!: string;

  @Column({ type: 'timestamp with time zone', default: () => 'now()' })
  createdAt!: Generated<Date>;
}
