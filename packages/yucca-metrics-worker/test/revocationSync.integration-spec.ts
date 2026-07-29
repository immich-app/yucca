import { Redis } from 'ioredis';
import { Kysely } from 'kysely';
import { randomUUID } from 'node:crypto';
import { env } from 'src/env';
import { ResticTokenRepository } from 'src/repositories/resticToken.repository';
import { DB } from 'src/schema';
import { RevocationSyncService } from 'src/services/revocationSync.service';
import { getKyselyConfig } from 'src/utils/database';

const keyFor = (jti: string) => `yucca:restic:valid:${jti}`;

const loggerStub = { info: () => {}, warn: () => {}, error: () => {} } as never;

// Proves the two-direction reconcile against real Postgres + Redis:
// - a valid restic token missing its marker (Redis restarted) gets it re-asserted;
// - a revoked token whose inline DEL was missed gets its stale marker swept —
//   including a token orphaned by a connection delete (connectionId NULL);
// - a valid token of a NON-revocable type (immich) gets no marker.
describe('RevocationSyncService (integration)', () => {
  let db: Kysely<DB>;
  let redis: Redis;
  let service: RevocationSyncService;

  const inOneHour = () => new Date(Date.now() + 3_600_000);

  beforeAll(() => {
    db = new Kysely<DB>(getKyselyConfig());
    redis = new Redis(env.REDIS_URL!, { maxRetriesPerRequest: 2, connectTimeout: 2000 });
    service = new RevocationSyncService(loggerStub, new ResticTokenRepository(db));
  });

  afterAll(async () => {
    service.onModuleDestroy();
    redis.disconnect();
    await db.destroy();
  });

  it('re-asserts valid markers and sweeps revoked ones', async () => {
    const suffix = randomUUID().slice(0, 8);
    const user = await db
      .insertInto('users')
      .values({ sub: `reconcile-${suffix}`, name: 'reconcile-test', email: `reconcile-${suffix}@example.com` })
      .returningAll()
      .executeTakeFirstOrThrow();

    const validJti = randomUUID();
    const revokedJti = randomUUID();
    const orphanJti = randomUUID();
    const immichJti = randomUUID();

    try {
      const restic = await db
        .insertInto('connections')
        .values({ userId: user.id, type: 'restic', name: 'reconcile-restic' })
        .returningAll()
        .executeTakeFirstOrThrow();
      const immich = await db
        .insertInto('connections')
        .values({ userId: user.id, type: 'immich', name: 'reconcile-immich' })
        .returningAll()
        .executeTakeFirstOrThrow();
      const repository = await db
        .insertInto('repositories')
        .values({ name: 'reconcile-repo', worm: false, userId: user.id, connectionId: restic.id })
        .returningAll()
        .executeTakeFirstOrThrow();

      const base = { repositoryId: repository.id, userId: user.id, mintedBy: 'user', expiresAt: inOneHour() };
      await db
        .insertInto('resticTokens')
        .values([
          { ...base, jti: validJti, connectionId: restic.id },
          { ...base, jti: revokedJti, connectionId: restic.id, revokedAt: new Date(), revokedBy: 'test' },
          { ...base, jti: orphanJti, connectionId: null, revokedAt: new Date(), revokedBy: 'test' },
          { ...base, jti: immichJti, connectionId: immich.id },
        ])
        .execute();

      // Simulate a restarted Redis (valid marker lost) and two missed DELs
      // (revoked in the DB, marker still present).
      await redis.del(keyFor(validJti));
      await redis.set(keyFor(revokedJti), '1', 'EX', 3600);
      await redis.set(keyFor(orphanJti), '1', 'EX', 3600);

      await service.sync();

      expect(await redis.exists(keyFor(validJti))).toBe(1); // healed: re-asserted
      expect(await redis.ttl(keyFor(validJti))).toBeGreaterThan(0); // tracks token expiry
      expect(await redis.exists(keyFor(revokedJti))).toBe(0); // healed: swept
      expect(await redis.exists(keyFor(orphanJti))).toBe(0); // swept despite NULL connection
      expect(await redis.exists(keyFor(immichJti))).toBe(0); // non-revocable: no marker
    } finally {
      await redis.del(keyFor(validJti), keyFor(revokedJti), keyFor(orphanJti), keyFor(immichJti));
      // repositories.userId/.connectionId are RESTRICT — delete bottom-up.
      await db.deleteFrom('resticTokens').where('userId', '=', user.id).execute();
      await db.deleteFrom('repositories').where('userId', '=', user.id).execute();
      await db.deleteFrom('connections').where('userId', '=', user.id).execute();
      await db.deleteFrom('users').where('id', '=', user.id).execute();
    }
  });
});
