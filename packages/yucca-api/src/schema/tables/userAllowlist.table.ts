import { Column, type Generated, Table } from '@immich/sql-tools';

@Table({ name: 'userAllowlist' })
export class UserAllowlistTable {
  @Column({ primary: true, type: 'uuid', default: () => 'gen_random_uuid()' })
  id!: Generated<string>;

  @Column({ unique: true })
  email!: string;

  @Column({ unique: true })
  inviteCode!: string;

  @Column({ type: 'boolean', default: () => 'false' })
  invited!: Generated<boolean>;

  @Column({ type: 'boolean', default: () => 'false' })
  inviteUsed!: Generated<boolean>;

  @Column({ type: 'timestamp with time zone', nullable: true })
  inviteUsedAt!: Date | null;

  @Column({ type: 'timestamp with time zone', default: () => 'now()' })
  createdAt!: Generated<Date>;
}
