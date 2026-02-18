import { Generated } from 'kysely';

export class SessionTable {
  id!: Generated<string>;
  userId!: string;
  accessToken!: string;
}
