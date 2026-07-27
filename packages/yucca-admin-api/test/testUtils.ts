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
    await db.deleteFrom('repositories').execute();
    await db.deleteFrom('sessions').execute();
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
  }: Partial<{ name: string; email: string; sub: string; disabled: boolean }> = {}) => {
    return getDb()
      .insertInto('users')
      .values({ name, email: email ?? `${randomUUID()}@example.test`, sub: sub ?? randomUUID(), disabled })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  createSession: (userId: string, accessToken: string = randomUUID()) => {
    return getDb().insertInto('sessions').values({ userId, accessToken }).returningAll().executeTakeFirstOrThrow();
  },

  createRepository: (
    userId: string,
    { name = 'My Repository', worm = false }: Partial<{ name: string; worm: boolean }> = {},
  ) => {
    return getDb().insertInto('repositories').values({ userId, name, worm }).returningAll().executeTakeFirstOrThrow();
  },

  getUser: (id: string) => {
    return getDb().selectFrom('users').selectAll().where('id', '=', id).executeTakeFirst();
  },

  getSession: (id: string) => {
    return getDb().selectFrom('sessions').selectAll().where('id', '=', id).executeTakeFirst();
  },
};
