import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DB } from '../schema';
import { BackendConfiguration } from '../schema/tables/backend.table';

@Injectable()
export class BackendRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  async updateBackend(id: string, configuration: BackendConfiguration) {
    await this.db
      .insertInto('backends')
      .values({
        id,
        configuration: JSON.stringify(configuration),
      })
      .onConflict((oc) => oc.doUpdateSet({ configuration: JSON.stringify(configuration) }))
      .executeTakeFirstOrThrow();
  }

  async getBackends() {
    const backends = await this.db.selectFrom('backends').selectAll('backends').execute();
    return backends.map(({ id, configuration }) => ({
      id,
      configuration: JSON.parse(configuration) as BackendConfiguration,
    }));
  }

  async getBackend(id: string) {
    const backend = await this.db
      .selectFrom('backends')
      .selectAll('backends')
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
      
    return {
      id: backend.id,
      configuration: JSON.parse(backend.configuration) as BackendConfiguration,
    };
  }
}
