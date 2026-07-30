import { Column, type Generated, Table } from '@immich/sql-tools';
import type { ConfigOverrides } from 'src/utils/settings';

@Table({ name: 'settings' })
export class SettingsTable {
  @Column({ primary: true, type: 'text' })
  scope!: string;

  @Column({ type: 'jsonb' })
  value!: ConfigOverrides;

  @Column({ type: 'timestamp with time zone', default: () => 'now()' })
  updatedAt!: Generated<Date>;
}
