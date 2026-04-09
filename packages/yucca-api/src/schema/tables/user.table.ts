import { Column, type Generated, Table } from '@immich/sql-tools';

@Table({ name: 'users' })
export class UserTable {
  @Column({ primary: true, type: 'uuid', default: () => 'gen_random_uuid()' })
  id!: Generated<string>;

  @Column({ index: true, unique: true })
  sub!: string;

  @Column()
  name!: string;

  @Column({ unique: true })
  email!: string;
}
