import Database from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import { DB } from '../schema';
import { ConfigRepository } from './config.repository';

describe(ConfigRepository.name, () => {
  let db: Kysely<DB>;
  let sut: ConfigRepository;

  beforeEach(async () => {
    const database = new Database(':memory:');
    db = new Kysely<DB>({
      dialect: new SqliteDialect({ database }),
    });

    await db.schema
      .createTable('config')
      .addColumn('key', 'varchar', (col) => col.primaryKey())
      .addColumn('value', 'varchar')
      .execute();

    sut = new ConfigRepository(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  describe('bootstrap', () => {
    it('generates an encryption key on first run', async () => {
      await sut.bootstrap();
      expect(await sut.hasEncryptionKey()).toBe(true);

      const key = await sut.getMasterEncryptionKey();
      expect(key).toMatch(/^[a-f0-9]{64}$/);
    });

    it('does not overwrite existing key', async () => {
      await sut.bootstrap();
      const firstKey = await sut.getMasterEncryptionKey();

      await sut.bootstrap();
      const secondKey = await sut.getMasterEncryptionKey();

      expect(secondKey).toBe(firstKey);
    });
  });

  describe('deriveEncryptionKey', () => {
    beforeEach(async () => {
      await sut.importEncryptionKey('a'.repeat(64));
    });

    it('derives expected key for repository-abc', async () => {
      const key = await sut.deriveEncryptionKey('repository-abc');
      expect(Buffer.from(key).toString('hex')).toMatchInlineSnapshot(
        `"5a69981e582355d45c2ad166be51aa65dcb6810bed4b78209a6fdfccf8b3313c"`,
      );
    });

    it('derives expected key for repository-xyz', async () => {
      const key = await sut.deriveEncryptionKey('repository-xyz');
      expect(Buffer.from(key).toString('hex')).toMatchInlineSnapshot(
        `"21e9aaeb1edceb759eaaa83f9c71243c7d7ef48b461b31e88566149f2c25f826"`,
      );
    });

    it('derives different key with different master key', async () => {
      await sut.importEncryptionKey('b'.repeat(64));
      const key = await sut.deriveEncryptionKey('repository-abc');
      expect(Buffer.from(key).toString('hex')).toMatchInlineSnapshot(
        `"3a1ea08788c7830811c8ccbe20b67df5c2c91957c8379c26af4643302ae76a8d"`,
      );
    });
  });

  describe('importEncryptionKey', () => {
    it('replaces the current key', async () => {
      await sut.bootstrap();
      const original = await sut.getMasterEncryptionKey();

      await sut.importEncryptionKey('f'.repeat(64));
      expect(await sut.getMasterEncryptionKey()).toBe('f'.repeat(64));
      expect(await sut.getMasterEncryptionKey()).not.toBe(original);
    });
  });

  describe('onboarding flags', () => {
    it('tracks key onboarding status', async () => {
      expect(await sut.hasOnboardedKey()).toBe(false);
      await sut.confirmKeyOnboarded();
      expect(await sut.hasOnboardedKey()).toBe(true);
    });

    it('tracks skipped extra config', async () => {
      expect(await sut.hasSkippedExtraConfig()).toBe(false);
      await sut.skipExtraConfig();
      expect(await sut.hasSkippedExtraConfig()).toBe(true);
    });
  });
});
