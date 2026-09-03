import { Column, ForeignKeyColumn, type Generated, Table } from '@immich/sql-tools';
import { AuditAction } from 'src/enum';
import { audit_action_enum } from '../enums';
import { UserTable } from './user.table';

export interface AuditLogDetail {
  ticket: { id: string; validAt: Date | null };
  repository: Record<string, unknown>;
}

@Table({ name: 'auditLog' })
export class AuditLogTable {
  @Column({ primary: true, type: 'uuid', default: () => 'gen_random_uuid()' })
  id!: Generated<string>;

  @Column({ type: 'enum', enum: audit_action_enum })
  action!: AuditAction;

  @ForeignKeyColumn(() => UserTable, { onUpdate: 'CASCADE', onDelete: 'SET NULL', nullable: true, index: true })
  userId!: string | null;

  @Column({ type: 'jsonb' })
  detail!: AuditLogDetail;

  @Column({ type: 'timestamp with time zone', default: () => 'now()' })
  createdAt!: Generated<Date>;
}
