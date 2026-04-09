import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DB } from '../schema';
import { ImmichRepositoryConfig } from '../schema/tables/repositoryIntegrationImmich.table';

@Injectable()
export class RepositoryIntegrationImmichRepository {
  constructor(@InjectKysely('orchestrator') private db: Kysely<DB>) {}

  async get() {
    const integration = await this.db.selectFrom('repositoryIntegrationImmich').selectAll().executeTakeFirst();
    if (!integration) {
      return;
    }

    return {
      id: integration.id,
      scheduleId: integration.scheduleId,
      configuration: JSON.parse(integration.configuration) as ImmichRepositoryConfig,
    };
  }

  async upsert(id: string, scheduleId: string, configuration: ImmichRepositoryConfig) {
    await this.db
      .insertInto('repositoryIntegrationImmich')
      .values({
        id,
        scheduleId,
        configuration: JSON.stringify(configuration),
      })
      .onConflict((oc) => oc.column('id').doUpdateSet({ configuration: JSON.stringify(configuration), scheduleId }))
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async delete() {
    await this.db.deleteFrom('repositoryIntegrationImmich').execute();
  }
}
