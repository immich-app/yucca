import { Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DB } from 'src/schema';

@Injectable()
export class DiscordLinkRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  getByUserId(userId: string) {
    return this.db.selectFrom('discordLinks').selectAll().where('userId', '=', userId).executeTakeFirst();
  }

  link(userId: string, discordUserId: string, discordUsername: string) {
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

  unlink(userId: string): Promise<boolean> {
    return this.db.transaction().execute(async (trx) => {
      await sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`.execute(trx);
      const removed = await trx
        .deleteFrom('discordLinks')
        .where('userId', '=', userId)
        .returning('id')
        .executeTakeFirst();
      return removed !== undefined;
    });
  }
}
