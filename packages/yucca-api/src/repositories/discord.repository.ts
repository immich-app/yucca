import { Injectable } from '@nestjs/common';
import { Insertable, Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DB } from 'src/schema';
import { DiscordLinkRequestTable } from 'src/schema/tables/discordLinkRequest.table';

@Injectable()
export class DiscordRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  createRequest(request: Insertable<DiscordLinkRequestTable>) {
    return this.db.insertInto('discordLinkRequests').values(request).returningAll().executeTakeFirstOrThrow();
  }

  getRequestByCode(code: string) {
    return this.db.selectFrom('discordLinkRequests').selectAll().where('code', '=', code).executeTakeFirst();
  }

  async deleteExpiredRequests() {
    await this.db.deleteFrom('discordLinkRequests').where('expiresAt', '<', new Date()).execute();
  }

  getLinkByDiscordUserId(discordUserId: string) {
    return this.db.selectFrom('discordLinks').selectAll().where('discordUserId', '=', discordUserId).executeTakeFirst();
  }

  getLinkByUserId(userId: string) {
    return this.db.selectFrom('discordLinks').selectAll().where('userId', '=', userId).executeTakeFirst();
  }

  link(requestId: string, userId: string, discordUserId: string, discordUsername: string) {
    return this.db.transaction().execute(async (trx) => {
      await sql`SELECT pg_advisory_xact_lock(least(hashtext(${userId}), hashtext(${discordUserId}))),
                       pg_advisory_xact_lock(greatest(hashtext(${userId}), hashtext(${discordUserId})))`.execute(trx);
      const consumed = await trx
        .deleteFrom('discordLinkRequests')
        .where('id', '=', requestId)
        .where('expiresAt', '>', new Date())
        .returning('id')
        .executeTakeFirst();
      if (!consumed) {
        return null;
      }
      await trx
        .deleteFrom('discordLinks')
        .where((eb) => eb.or([eb('userId', '=', userId), eb('discordUserId', '=', discordUserId)]))
        .execute();
      return trx
        .insertInto('discordLinks')
        .values({ userId, discordUserId, discordUsername })
        .returningAll()
        .executeTakeFirstOrThrow();
    });
  }

  async updateUsername(discordUserId: string, discordUsername: string): Promise<boolean> {
    const updated = await this.db
      .updateTable('discordLinks')
      .set({ discordUsername })
      .where('discordUserId', '=', discordUserId)
      .returning('id')
      .executeTakeFirst();
    return updated !== undefined;
  }

  getUserSummary(userId: string) {
    return this.db
      .selectFrom('users')
      .where('users.id', '=', userId)
      .select((eb) => [
        'users.id',
        'users.name',
        'users.email',
        'users.createdAt',
        eb
          .selectFrom('connections')
          .select((inner) => inner.fn.countAll<number>().as('count'))
          .whereRef('connections.userId', '=', 'users.id')
          .as('connectionCount'),
        eb
          .selectFrom('repositories')
          .select((inner) => inner.fn.countAll<number>().as('count'))
          .whereRef('repositories.userId', '=', 'users.id')
          .as('repositoryCount'),
        eb
          .selectFrom('connections')
          .select((inner) => inner.fn.max('connections.lastSeenAt').as('max'))
          .whereRef('connections.userId', '=', 'users.id')
          .as('lastSeenAt'),
      ])
      .executeTakeFirst();
  }
}
