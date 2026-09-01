import { Injectable } from '@nestjs/common';
import { Insertable, Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { TicketAction } from 'src/enum';
import { DB } from 'src/schema';
import { TicketTable } from 'src/schema/tables/ticket.table';
import { meterJson, metricsJson } from './repository.repository';

@Injectable()
export class TicketRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  create(ticket: Insertable<TicketTable>) {
    return this.db.insertInto('tickets').values(ticket).returningAll().executeTakeFirstOrThrow();
  }

  getPending(oidcState: string) {
    return this.db
      .selectFrom('tickets')
      .selectAll('tickets')
      .where('tickets.oidcState', '=', oidcState)
      .where('tickets.validAt', 'is', null)
      .where('tickets.consumedAt', 'is', null)
      .where('tickets.expiresAt', '>', new Date())
      .executeTakeFirst();
  }

  getActive(id: string, token: string) {
    return this.db
      .selectFrom('tickets')
      .innerJoin('repositories', 'repositories.id', 'tickets.repositoryId')
      .leftJoin('repositoryMetrics', 'repositoryMetrics.id', 'repositories.id')
      .leftJoin('repositoryMeter', 'repositoryMeter.repositoryId', 'repositories.id')
      .select(['tickets.id', 'tickets.action', 'tickets.repositoryId', 'repositories.name as repositoryName'])
      .where('tickets.id', '=', id)
      .where('tickets.token', '=', token)
      .where('tickets.validAt', 'is not', null)
      .where('tickets.consumedAt', 'is', null)
      .where('tickets.expiresAt', '>', new Date())
      .select(metricsJson)
      .select(meterJson)
      .executeTakeFirst();
  }

  activate(id: string) {
    return this.db
      .updateTable('tickets')
      .set({ validAt: new Date() })
      .where('id', '=', id)
      .where('validAt', 'is', null)
      .where('expiresAt', '>', new Date())
      .returningAll()
      .executeTakeFirst();
  }

  spend(id: string, token: string, action: TicketAction, repositoryId: string) {
    return this.db
      .updateTable('tickets')
      .set({ consumedAt: new Date() })
      .where('id', '=', id)
      .where('token', '=', token)
      .where('action', '=', action)
      .where('repositoryId', '=', repositoryId)
      .where('validAt', 'is not', null)
      .where('consumedAt', 'is', null)
      .where('expiresAt', '>', new Date())
      .returningAll()
      .executeTakeFirst();
  }

  async deleteExpired() {
    // TODO: This fn has no call sites yet!
    // We need some kind of regular cron to clean up expired tickets...
    // I suppose this can be done alongside the repository prune automation
    await this.db.deleteFrom('tickets').where('expiresAt', '<', new Date()).execute();
  }
}
