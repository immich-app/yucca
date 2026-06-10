import { Column, type Generated, Table } from '@immich/sql-tools';
import { type SubscriptionStatus } from '@polar-sh/sdk/models/components/subscriptionstatus.js';

@Table({ name: 'users' })
export class UserTable {
  @Column({ primary: true, type: 'uuid', default: () => 'gen_random_uuid()' })
  id!: Generated<string>;

  @Column({ index: true, unique: true })
  sub!: string;

  @Column()
  name!: string;

  @Column({ unique: true })
  email!: string;

  @Column({ type: 'boolean', default: () => 'false' })
  disabled!: Generated<boolean>;

  @Column({ index: true, unique: true, nullable: true })
  polarUserId?: string;

  @Column({ index: true, unique: true, nullable: true })
  polarSubscriptionId?: string;

  @Column({ type: 'text', nullable: true })
  polarSubscriptionState?: SubscriptionStatus;
}
