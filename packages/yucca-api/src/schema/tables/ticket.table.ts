import { Column, ForeignKeyColumn, type Generated, Table } from '@immich/sql-tools';
import { TicketAction } from 'src/enum';
import { ticket_action_enum } from '../enums';
import { RepositoryTable } from './repository.table';
import { UserTable } from './user.table';

@Table({ name: 'tickets' })
export class TicketTable {
  @Column({ primary: true, type: 'uuid', default: () => 'gen_random_uuid()' })
  id!: Generated<string>;

  @Column({ unique: true })
  token!: string;

  @Column({ unique: true })
  oidcState!: string;

  @Column()
  oidcCodeVerifier!: string;

  @ForeignKeyColumn(() => UserTable, { onUpdate: 'CASCADE', onDelete: 'CASCADE', index: true })
  userId!: string;

  @ForeignKeyColumn(() => RepositoryTable, { onUpdate: 'CASCADE', onDelete: 'CASCADE', index: true })
  repositoryId!: string;

  @Column({ type: 'enum', enum: ticket_action_enum })
  action!: TicketAction;

  @Column({ type: 'timestamp with time zone', nullable: true })
  authTime!: Date | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  validAt!: Date | null;

  @Column({ type: 'timestamp with time zone' })
  expiresAt!: Date;

  @Column({ type: 'timestamp with time zone', nullable: true })
  consumedAt!: Date | null;

  @Column({ type: 'timestamp with time zone', default: () => 'now()' })
  createdAt!: Generated<Date>;
}
