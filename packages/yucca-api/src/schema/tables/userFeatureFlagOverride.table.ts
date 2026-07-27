import { Column, ForeignKeyColumn, type Generated, Table, Unique } from '@immich/sql-tools';
import { UserTable } from './user.table';

// Per-user exceptions to the feature-flag registry defaults (@common/server
// FeatureFlags). Clearing a row reverts the user to the registry default —
// which is not the same as a row with value=false.
@Table({ name: 'userFeatureFlagOverride' })
@Unique({ columns: ['userId', 'flag'] })
export class UserFeatureFlagOverrideTable {
  @Column({ primary: true, type: 'uuid', default: () => 'gen_random_uuid()' })
  id!: Generated<string>;

  @ForeignKeyColumn(() => UserTable, { onUpdate: 'CASCADE', onDelete: 'CASCADE' })
  userId!: string;

  @Column()
  flag!: string;

  @Column({ type: 'boolean' })
  value!: boolean;

  // Admin `sub` from the admin-api session that set the override.
  @Column()
  setBy!: string;

  @Column({ nullable: true })
  reason!: string | null;

  @Column({ type: 'timestamp with time zone', default: () => 'now()' })
  createdAt!: Generated<Date>;

  @Column({ type: 'timestamp with time zone', default: () => 'now()' })
  updatedAt!: Generated<Date>;
}
