import { Kysely } from 'kysely';
import { randomUUID } from 'node:crypto';
import { DB } from 'src/schema';
import { getKyselyConfig } from 'src/utils/database';

let db: Kysely<DB>;

function getDb() {
  if (!db) {
    db = new Kysely(getKyselyConfig());
  }

  return db;
}

export const testUtils = {
  resetDatabase: async () => {
    const db = getDb();
    await db.deleteFrom('resticTokens').execute();
    await db.deleteFrom('repositories').execute();
    await db.deleteFrom('sessions').execute();
    await db.deleteFrom('consumers').execute();
    await db.deleteFrom('userFeatureFlagOverride').execute();
    await db.deleteFrom('users').execute();
    await db.deleteFrom('userAllowlist').execute();
  },

  createAllowlistEntry: ({
    email,
    inviteCode,
    invited = false,
    createdAt,
  }: {
    email: string;
    inviteCode?: string;
    invited?: boolean;
    createdAt?: Date;
  }) => {
    return getDb()
      .insertInto('userAllowlist')
      .values({
        email,
        inviteCode: inviteCode ?? randomUUID().slice(0, 10).toUpperCase(),
        invited,
        ...(createdAt ? { createdAt } : {}),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  getAllowlistEntry: (email: string) => {
    return getDb().selectFrom('userAllowlist').selectAll().where('email', '=', email).executeTakeFirst();
  },

  createUser: ({
    name = 'foo',
    email,
    sub,
    disabled = false,
    createdAt,
  }: Partial<{ name: string; email: string; sub: string; disabled: boolean; createdAt: Date }> = {}) => {
    return getDb()
      .insertInto('users')
      .values({
        name,
        email: email ?? `${randomUUID()}@example.test`,
        sub: sub ?? randomUUID(),
        disabled,
        ...(createdAt ? { createdAt } : {}),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  getResticToken: (jti: string) => {
    return getDb().selectFrom('resticTokens').selectAll().where('jti', '=', jti).executeTakeFirst();
  },

  createSession: (userId: string, accessToken: string = randomUUID()) => {
    return getDb().insertInto('sessions').values({ userId, accessToken }).returningAll().executeTakeFirstOrThrow();
  },

  createConsumer: (
    userId: string,
    { type = 'immich', name = 'Immich' }: Partial<{ type: string; name: string }> = {},
  ) => {
    return getDb().insertInto('consumers').values({ userId, type, name }).returningAll().executeTakeFirstOrThrow();
  },

  createRepository: async (
    userId: string,
    {
      name = 'My Repository',
      worm = false,
      consumerId,
    }: Partial<{ name: string; worm: boolean; consumerId: string }> = {},
  ) => {
    const db = getDb();
    if (!consumerId) {
      const consumer =
        (await db.selectFrom('consumers').selectAll().where('userId', '=', userId).executeTakeFirst()) ??
        (await testUtils.createConsumer(userId));
      consumerId = consumer.id;
    }
    return db
      .insertInto('repositories')
      .values({ userId, name, worm, consumerId })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  getUser: (id: string) => {
    return getDb().selectFrom('users').selectAll().where('id', '=', id).executeTakeFirst();
  },

  getSession: (id: string) => {
    return getDb().selectFrom('sessions').selectAll().where('id', '=', id).executeTakeFirst();
  },
};
