import { registerEnum } from '@immich/sql-tools';
import { TicketAction } from 'src/enum';

export const ticket_action_enum = registerEnum({
  name: 'ticket_action_enum',
  values: Object.values(TicketAction),
});
