import { Generated } from 'kysely';

export class UserTable {
  id!: Generated<string>;
  sub!: string;
  name!: string;
  email!: string;
}
