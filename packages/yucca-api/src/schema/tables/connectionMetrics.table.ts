import { Column, ForeignKeyColumn, type Generated, Table } from '@immich/sql-tools';
import { ConnectionTable } from './connection.table';

@Table({ name: 'connectionMetrics' })
export class ConnectionMetricsTable {
  @ForeignKeyColumn(() => ConnectionTable, { primary: true, onUpdate: 'CASCADE', onDelete: 'CASCADE' })
  connectionId!: string;

  @Column({ type: 'bigint' })
  sizeBytes!: number;

  @Column({ type: 'bigint' })
  objectCount!: number;

  @Column({ type: 'bigint' })
  billableBytes!: number;

  @Column({ type: 'integer' })
  repositoryCount!: number;

  @Column({ type: 'timestamp with time zone', default: () => 'now()' })
  updatedAt!: Generated<Date>;
}
