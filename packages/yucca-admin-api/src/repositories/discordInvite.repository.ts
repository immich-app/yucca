import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DB } from 'src/schema';

@Injectable()
export class DiscordInviteRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  listClaims() {
    return this.db
      .selectFrom('userAllowlist')
      .selectAll()
      .where('discordUserId', 'is not', null)
      .orderBy('createdAt', 'desc')
      .execute();
  }

  getClaim(discordUserId: string) {
    return this.db
      .selectFrom('userAllowlist')
      .selectAll()
      .where('discordUserId', '=', discordUserId)
      .executeTakeFirst();
  }

  deleteClaim(id: string, discordUserId: string): Promise<'deleted' | 'linked' | 'used'> {
    return this.db.transaction().execute(async (trx) => {
      // Linking holds pg_advisory_xact_lock(hashtext(discordUserId)); taking it
      // here serializes revocation against an in-flight redemption, whose link
      // row lands before markUsed does.
      await sql`SELECT pg_advisory_xact_lock(hashtext(${discordUserId}))`.execute(trx);
      const link = await trx
        .selectFrom('discordLinks')
        .select('id')
        .where('discordUserId', '=', discordUserId)
        .executeTakeFirst();
      if (link) {
        return 'linked';
      }
      const deleted = await trx
        .deleteFrom('userAllowlist')
        .where('id', '=', sql<string>`${id}::uuid`)
        .where('inviteUsed', '=', false)
        .returning('id')
        .executeTakeFirst();
      return deleted === undefined ? 'used' : 'deleted';
    });
  }

  listBatches() {
    return this.batchesWithCounts().execute();
  }

  getBatch(id: string) {
    return this.batchesWithCounts()
      .where('discordInviteBatches.id', '=', sql<string>`${id}::uuid`)
      .executeTakeFirst();
  }

  private batchesWithCounts() {
    return this.db
      .selectFrom('discordInviteBatches')
      .leftJoin('userAllowlist', 'userAllowlist.batchId', 'discordInviteBatches.id')
      .selectAll('discordInviteBatches')
      .select((eb) => [
        eb.fn.count<number>('userAllowlist.id').as('claimed'),
        eb.fn.count<number>('userAllowlist.id').filterWhere('userAllowlist.inviteUsed', '=', true).as('used'),
      ])
      .groupBy('discordInviteBatches.id')
      .orderBy('discordInviteBatches.createdAt', 'desc');
  }

  cancelBatch(id: string, revokeUnused: boolean): Promise<number> {
    return this.db.transaction().execute(async (trx) => {
      // Claim transactions hold pg_advisory_xact_lock(hashtext(batchId));
      // taking it here fences out in-flight claims so none can slip in after
      // the cancellation and unused-claim sweep.
      await sql`SELECT pg_advisory_xact_lock(hashtext(${id}))`.execute(trx);
      await trx
        .updateTable('discordInviteBatches')
        .set({ cancelledAt: new Date() })
        .where('id', '=', sql<string>`${id}::uuid`)
        .where('cancelledAt', 'is', null)
        .execute();
      if (!revokeUnused) {
        return 0;
      }
      const deleted = await trx
        .deleteFrom('userAllowlist')
        .where('batchId', '=', sql<string>`${id}::uuid`)
        .where('inviteUsed', '=', false)
        .where('discordUserId', 'is not', null)
        .returning('id')
        .execute();
      return deleted.length;
    });
  }
}
