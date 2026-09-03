import { registerEnum } from '@immich/sql-tools';
import { AuditAction, TicketAction } from 'src/enum';

export const ticket_action_enum = registerEnum({
  name: 'ticket_action_enum',
  values: Object.values(TicketAction),
});

export const audit_action_enum = registerEnum({
  name: 'audit_action_enum',
  values: Object.values(AuditAction),
});
