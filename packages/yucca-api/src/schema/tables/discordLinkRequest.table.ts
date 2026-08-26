import { Column, type Generated, Table } from '@immich/sql-tools';

@Table({ name: 'discordLinkRequests' })
export class DiscordLinkRequestTable {
  @Column({ primary: true, type: 'uuid', default: () => 'gen_random_uuid()' })
  id!: Generated<string>;

  @Column({ unique: true })
  code!: string;

  @Column()
  discordUserId!: string;

  @Column()
  discordUsername!: string;

  @Column({ type: 'timestamp with time zone' })
  expiresAt!: Date;

  @Column({ type: 'timestamp with time zone', default: () => 'now()' })
  createdAt!: Generated<Date>;
}
