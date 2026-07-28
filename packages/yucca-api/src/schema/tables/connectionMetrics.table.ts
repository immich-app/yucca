import { Column, ForeignKeyColumn, type Generated, Table } from '@immich/sql-tools';
import { ConnectionTable } from './connection.table';

// Per-connection usage rollup: the sum of a connection's repositories' storage, plus the
// type-aware `billableBytes` (min-object-size floor applied). Maintained by yucca-metrics-worker
// after the per-repository RGW meter sync. One row per connection.
@Table({ name: 'connectionMetrics' })
export class ConnectionMetricsTable {
  @ForeignKeyColumn(() => ConnectionTable, { primary: true, onUpdate: 'CASCADE', onDelete: 'CASCADE' })
  connectionId!: string;

  @Column({ type: 'bigint' })
  sizeBytes!: number;

  @Column({ type: 'bigint' })
  objectCount!: number;

  // Type-aware billed bytes (see @common/server billableBytes).
  @Column({ type: 'bigint' })
  billableBytes!: number;

  @Column({ type: 'integer' })
  repositoryCount!: number;

  @Column({ type: 'timestamp with time zone', default: () => 'now()' })
  updatedAt!: Generated<Date>;
}
