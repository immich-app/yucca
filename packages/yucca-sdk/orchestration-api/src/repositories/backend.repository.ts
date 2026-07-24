import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { Backend } from '../backends/backend';
import { DB } from '../schema';
import { BackendConfiguration } from '../schema/tables/backend.table';

@Injectable()
export class BackendRepository {
  constructor(@InjectKysely('orchestrator') private db: Kysely<DB>) {}

  async updateBackend(id: string, configuration: BackendConfiguration) {
    return await this.db
      .insertInto('backends')
      .values({
        id,
        configuration: JSON.stringify(configuration),
      })
      .onConflict((oc) => oc.doUpdateSet({ configuration: JSON.stringify(configuration) }))
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async getBackends() {
    const backends = await this.db.selectFrom('backends').selectAll('backends').execute();
    return backends
      .map(({ id, configuration }) => ({
        id,
        configuration: JSON.parse(configuration) as BackendConfiguration,
      }))
      .map(({ id, configuration }) => ({ id, configuration, backend: Backend.from(configuration) }));
  }

  async getBackend(id: string) {
    const backend = await this.db.selectFrom('backends').selectAll('backends').where('id', '=', id).executeTakeFirst();

    if (backend) {
      const configuration = JSON.parse(backend.configuration) as BackendConfiguration;

      return {
        id: backend.id,
        configuration,
        backend: Backend.from(configuration),
      };
    }
  }
}
