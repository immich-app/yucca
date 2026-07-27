import { Injectable } from '@nestjs/common';
import { Insertable, Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DB } from 'src/schema';
import { ResticTokenTable } from 'src/schema/tables/resticToken.table';

@Injectable()
export class ResticTokenRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  create(token: Insertable<ResticTokenTable>) {
    return this.db.insertInto('resticTokens').values(token).returningAll().executeTakeFirstOrThrow();
  }

  get(jti: string) {
    return this.db
      .selectFrom('resticTokens')
      .selectAll()
      .where('jti', '=', sql<string>`${jti}::uuid`)
      .executeTakeFirst();
  }

  async list({
    cursor,
    limit,
    userId,
    repositoryId,
    active,
  }: {
    cursor?: string;
    limit: number;
    userId?: string;
    repositoryId?: string;
    active?: boolean;
  }) {
    const rows = await this.db
      .selectFrom('resticTokens')
      .selectAll()
      .orderBy('jti', 'asc')
      .limit(limit + 1)
      .$if(cursor !== undefined, (qb) => qb.where('jti', '>', cursor!))
      .$if(userId !== undefined, (qb) => qb.where('userId', '=', userId!))
      .$if(repositoryId !== undefined, (qb) => qb.where('repositoryId', '=', repositoryId!))
      .$if(active === true, (qb) => qb.where('revokedAt', 'is', null).where('expiresAt', '>', new Date()))
      .execute();

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return { items, nextCursor: hasMore ? (items.at(-1)?.jti ?? null) : null };
  }

  revoke(jti: string, revokedBy: string) {
    return this.db
      .updateTable('resticTokens')
      .set({ revokedAt: new Date(), revokedBy })
      .where('jti', '=', sql<string>`${jti}::uuid`)
      .where('revokedAt', 'is', null)
      .returningAll()
      .executeTakeFirst();
  }
}
