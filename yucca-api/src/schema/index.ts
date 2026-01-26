import { SessionTable } from './tables/session.table';
import { UserTable } from './tables/user.table';

export interface DB {
  users: UserTable;
  sessions: SessionTable;
}
