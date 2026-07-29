import { Column, type Generated, Table } from '@immich/sql-tools';
import type { ConfigOverrides } from 'src/utils/settings';

@Table({ name: 'settings' })
export class SettingsTable {
  // 'global' | 'site:<code>' | 'cluster:<code>'
  @Column({ primary: true, type: 'text' })
  scope!: string;

  @Column({ type: 'jsonb' })
  value!: ConfigOverrides;

  @Column({ type: 'timestamp with time zone', default: () => 'now()' })
  updatedAt!: Generated<Date>;
}
