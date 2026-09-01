import { Column, ForeignKeyColumn, type Generated, Table } from '@immich/sql-tools';
import { UserTable } from './user.table';

@Table({ name: 'discordTickets' })
export class DiscordTicketTable {
  @Column({ primary: true, type: 'uuid', default: () => 'gen_random_uuid()' })
  id!: Generated<string>;

  @Column({ unique: true })
  threadId!: string;

  @Column({ nullable: true })
  staffThreadId!: string | null;

  @Column({ unique: true })
  freshdeskTicketId!: string;

  @Column()
  discordUserId!: string;

  @ForeignKeyColumn(() => UserTable, { onUpdate: 'CASCADE', onDelete: 'SET NULL', nullable: true, index: false })
  userId!: string | null;

  @Column({ type: 'boolean', default: () => 'false' })
  emailSubscribed!: Generated<boolean>;

  @Column({ nullable: true })
  lastMirroredMessageId!: string | null;

  @Column({ nullable: true })
  lastStaffMirroredMessageId!: string | null;

  @Column({ nullable: true })
  lastFreshdeskConversationId!: string | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  closedAt!: Date | null;

  @Column({ type: 'timestamp with time zone', default: () => 'now()' })
  createdAt!: Generated<Date>;
}
