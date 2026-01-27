import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DB } from 'src/schema';

@Injectable()
export class DummyRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  get() {
    return sql
      .raw("SELECT 'Hello, World!' as hello_world;")
      .execute(this.db)
      .then((result) => (result.rows[0] as { hello_world: string }).hello_world);
  }
}
