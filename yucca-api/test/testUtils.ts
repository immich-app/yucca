import { Kysely } from 'kysely';
import { CryptoRepository } from 'src/repositories/crypto.repository';
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
    await db.deleteFrom('sessions').execute();
    await db.deleteFrom('users').execute();
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

  getUserBySub: (sub: string) => {
    const db = getDb();
    const userRepository = new UserRepository(db);
    return userRepository.getBySub(sub);
  },

  getUserByAccessToken: (accessToken: string) => {
    const db = getDb();
    const userRepository = new UserRepository(db);
    return userRepository.getByAccessToken(accessToken);
  },
};
