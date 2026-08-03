import { Kysely } from 'kysely';
import { CryptoRepository } from 'src/repositories/crypto.repository';
import { RepositoryRepository } from 'src/repositories/repository.repository';
import { SessionRepository } from 'src/repositories/session.repository';
import { UserRepository } from 'src/repositories/user.repository';
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
    await db.deleteFrom('userFeatureFlagOverride').execute();
    await db.deleteFrom('repositories').execute();
    await db.deleteFrom('sessions').execute();
    await db.deleteFrom('users').execute();
    await db.deleteFrom('userAllowlist').execute();
    await db.deleteFrom('settings').execute();
  },

  createAllowlistEntry: ({
    email,
    inviteCode = 'TESTCODE99',
    invited = true,
  }: {
    email: string;
    inviteCode?: string;
    invited?: boolean;
  }) => {
    return getDb()
      .insertInto('userAllowlist')
      .values({ email, inviteCode, invited })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  getAllowlistEntry: (email: string) => {
    return getDb().selectFrom('userAllowlist').selectAll().where('email', '=', email).executeTakeFirst();
  },

  createUser: async (name: string = 'foo', email: string = 'user@example.com', sub = 'foo') => {
    const db = getDb();
    const userRepository = new UserRepository(db);
    const sessionRepository = new SessionRepository(db);
    const cryptoRepository = new CryptoRepository();

    const user = await userRepository.create({
      name,
      email,
      sub,
    });

    const accessToken = cryptoRepository.randomHex(16);
    const session = await sessionRepository.create({
      userId: user.id,
      accessToken,
    });

    return {
      user,
      session,
    };
  },

  setFeatureOverride: (userId: string, flag: string, value: boolean, setBy = 'test-admin') => {
    return getDb()
      .insertInto('userFeatureFlagOverride')
      .values({ userId, flag, value, setBy })
      .onConflict((oc) => oc.columns(['userId', 'flag']).doUpdateSet({ value, updatedAt: new Date() }))
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  getUserBySub: (sub: string) => {
    const db = getDb();
    const userRepository = new UserRepository(db);
    return userRepository.getBySub(sub);
  },

  disableUser: async (id: string) => {
    const db = getDb();
    await db.updateTable('users').set({ disabled: true }).where('id', '=', id).execute();
  },

  getUserByAccessToken: (accessToken: string) => {
    const db = getDb();
    const userRepository = new UserRepository(db);
    return userRepository.getByAccessToken(accessToken);
  },

  createRepository: async (userId: string, name = 'My Repository', worm = false) => {
    const db = getDb();
    const repositoryRepository = new RepositoryRepository(db);

    return await repositoryRepository.create({
      name,
      worm,
      userId,
      siteCode: 'local',
      storageClusterCode: 'local-dev',
    });
  },
};
