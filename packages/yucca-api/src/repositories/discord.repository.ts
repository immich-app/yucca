import { Injectable } from '@nestjs/common';
import { Insertable, Kysely, Selectable, Updateable, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DB } from 'src/schema';
import { DiscordInviteBatchTable } from 'src/schema/tables/discordInviteBatch.table';
import { DiscordLinkRequestTable } from 'src/schema/tables/discordLinkRequest.table';
import { DiscordTicketTable } from 'src/schema/tables/discordTicket.table';
import { UserAllowlistTable } from 'src/schema/tables/userAllowlist.table';

export type InviteClaimResult =
  | { status: 'linked' | 'used' | 'unknownBatch' | 'exhausted' | 'cancelled' }
  | { status: 'ok'; entry: Selectable<UserAllowlistTable>; remaining: number | null };

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

  consumeInviteRequest(code: string) {
    return this.db
      .deleteFrom('discordLinkRequests')
      .where('code', '=', code)
      .where('allowlistId', 'is not', null)
      .where('expiresAt', '>', new Date())
      .returningAll()
      .executeTakeFirst();
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

  linkDirect(userId: string, discordUserId: string, discordUsername: string) {
    return this.db.transaction().execute(async (trx) => {
      await sql`SELECT pg_advisory_xact_lock(least(hashtext(${userId}), hashtext(${discordUserId}))),
                       pg_advisory_xact_lock(greatest(hashtext(${userId}), hashtext(${discordUserId})))`.execute(trx);
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

  createBatch(batch: Insertable<DiscordInviteBatchTable>) {
    return this.db.insertInto('discordInviteBatches').values(batch).returningAll().executeTakeFirstOrThrow();
  }

  async setBatchMessage(batchId: string, messageId: string): Promise<boolean> {
    const updated = await this.db
      .updateTable('discordInviteBatches')
      .set({ messageId })
      .where('id', '=', batchId)
      .returning('id')
      .executeTakeFirst();
    return updated !== undefined;
  }

  claimInvite(
    discordUserId: string,
    discordUsername: string,
    batchId: string | null,
    inviteCode: string,
  ): Promise<InviteClaimResult> {
    return this.db.transaction().execute(async (trx): Promise<InviteClaimResult> => {
      const lockKey = batchId ?? discordUserId;
      await sql`SELECT pg_advisory_xact_lock(least(hashtext(${discordUserId}), hashtext(${lockKey}))),
                       pg_advisory_xact_lock(greatest(hashtext(${discordUserId}), hashtext(${lockKey})))`.execute(trx);

      const link = await trx
        .selectFrom('discordLinks')
        .select('id')
        .where('discordUserId', '=', discordUserId)
        .executeTakeFirst();
      if (link) {
        return { status: 'linked' };
      }

      const existing = await trx
        .selectFrom('userAllowlist')
        .selectAll()
        .where('discordUserId', '=', discordUserId)
        .executeTakeFirst();
      if (existing) {
        return existing.inviteUsed ? { status: 'used' } : { status: 'ok', entry: existing, remaining: null };
      }

      let remaining: number | null = null;
      if (batchId) {
        const batch = await trx
          .selectFrom('discordInviteBatches')
          .selectAll()
          .where('id', '=', batchId)
          .executeTakeFirst();
        if (!batch) {
          return { status: 'unknownBatch' };
        }
        if (batch.cancelledAt) {
          return { status: 'cancelled' };
        }
        const { claimed } = await trx
          .selectFrom('userAllowlist')
          .select((eb) => eb.fn.countAll<number>().as('claimed'))
          .where('batchId', '=', batchId)
          .executeTakeFirstOrThrow();
        if (Number(claimed) >= batch.maxClaims) {
          return { status: 'exhausted' };
        }
        remaining = batch.maxClaims - Number(claimed) - 1;
      }

      const entry = await trx
        .insertInto('userAllowlist')
        .values({ inviteCode, invited: true, discordUserId, discordUsername, batchId })
        .returningAll()
        .executeTakeFirstOrThrow();
      return { status: 'ok', entry, remaining };
    });
  }

  createTicket(ticket: Insertable<DiscordTicketTable>) {
    return this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto('discordTickets')
        .values(ticket)
        .onConflict((oc) => oc.column('threadId').doNothing())
        .execute();
      return trx
        .selectFrom('discordTickets')
        .selectAll()
        .where('threadId', '=', ticket.threadId)
        .executeTakeFirstOrThrow();
    });
  }

  getTicketByThread(threadId: string) {
    return this.db
      .selectFrom('discordTickets')
      .selectAll()
      .where((eb) => eb.or([eb('threadId', '=', threadId), eb('staffThreadId', '=', threadId)]))
      .executeTakeFirst();
  }

  getTicketByFreshdeskId(freshdeskTicketId: string) {
    return this.db
      .selectFrom('discordTickets')
      .selectAll()
      .where('freshdeskTicketId', '=', freshdeskTicketId)
      .executeTakeFirst();
  }

  listOpenTickets() {
    return this.db
      .selectFrom('discordTickets')
      .selectAll()
      .where('closedAt', 'is', null)
      .orderBy('createdAt', 'asc')
      .execute();
  }

  async updateTicket(id: string, updates: Updateable<DiscordTicketTable>): Promise<boolean> {
    const updated = await this.db
      .updateTable('discordTickets')
      .set(updates)
      .where('id', '=', sql<string>`${id}::uuid`)
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
