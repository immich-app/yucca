import { Inject, Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { randomBytes } from 'node:crypto';
import { availableParallelism } from 'node:os';
import { resolve } from 'node:path';
import { ConfigurationKey } from '../enum';
import { type ModuleConfig, ModuleConfigProvider } from '../moduleConfig';
import { DB } from '../schema';
import { yuccaWellKnown } from '../wellKnown';
import { LoggingRepository } from './logging.repository';

export type ResticPlacement = { siteCode: string | null; storageClusterCode: string | null };

@Injectable()
export class ConfigRepository {
  constructor(
    @InjectKysely('orchestrator') private db: Kysely<DB>,
    @Inject(ModuleConfigProvider) private moduleConfig: ModuleConfig,
    private readonly logger: LoggingRepository,
  ) {
    this.logger.setContext(ConfigRepository.name);
  }

  async bootstrap() {
    const statePath = resolve(this.moduleConfig.statePath);
    const hasKey = await this.hasEncryptionKey();

    if (!hasKey) {
      await this.assertStateIsEmpty(statePath);

      this.logger.warn(
        `Generating a new master encryption key for the state in ${statePath}. Backups written with a previous key cannot be decrypted with this one.`,
      );

      await this.set(ConfigurationKey.EncryptionKey, randomBytes(32).toString('hex'));
    }

    await this.recordStatePath(statePath);

    const hasSecret = await this.hasSessionSecret();

    if (!hasSecret) {
      await this.set(ConfigurationKey.SessionSecret, randomBytes(32).toString('hex'));
    }
  }

  private async assertStateIsEmpty(statePath: string) {
    const [{ backends }] = await this.db
      .selectFrom('backends')
      .select((eb) => eb.fn.countAll<number>().as('backends'))
      .execute();

    const [{ repositories }] = await this.db
      .selectFrom('repositories')
      .select((eb) => eb.fn.countAll<number>().as('repositories'))
      .execute();

    if (backends === 0 && repositories === 0) {
      return;
    }

    throw new Error(
      `The state in ${statePath} has ${backends} backend(s) and ${repositories} repository(ies) but no master encryption key. Refusing to generate one, as that would make those backups undecryptable. Restore the original state database.`,
    );
  }

  private async recordStatePath(statePath: string) {
    const previous = await this.getOptional(ConfigurationKey.StatePath);

    if (previous === statePath) {
      return;
    }

    if (previous) {
      this.logger.warn(
        `The state database was created in ${previous} but is being opened from ${statePath}. If the original directory is still populated, two installations are now diverging.`,
      );
    }

    await this.set(ConfigurationKey.StatePath, statePath);
  }

  private async set(key: ConfigurationKey, value: string) {
    await this.db
      .insertInto('config')
      .values({
        key,
        value,
      })
      .onConflict((oc) => oc.doUpdateSet({ value }))
      .executeTakeFirstOrThrow();
  }

  private async get(key: ConfigurationKey) {
    const { value } = await this.db
      .selectFrom('config')
      .where('config.key', '=', key)
      .select('config.value')
      .executeTakeFirstOrThrow();

    return value;
  }

  private async getOptional(key: ConfigurationKey) {
    const row = await this.db
      .selectFrom('config')
      .where('config.key', '=', key)
      .select('config.value')
      .executeTakeFirst();

    return row?.value;
  }

  private async has(key: ConfigurationKey) {
    const results = await this.db.selectFrom('config').where('config.key', '=', key).selectAll().execute();

    return results.length > 0;
  }

  async hasEncryptionKey() {
    return this.has(ConfigurationKey.EncryptionKey);
  }

  async getMasterEncryptionKey(): Promise<string> {
    return await this.get(ConfigurationKey.EncryptionKey);
  }

  async deriveEncryptionKey(info: `repository-${string}`): Promise<Uint8Array> {
    const encryptionKey = await this.get(ConfigurationKey.EncryptionKey);
    const masterKey = Buffer.from(encryptionKey, 'hex');

    const key = new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: 'HKDF',
          hash: 'SHA-256',
          info: Buffer.from(info),
          salt: Buffer.from(Array.from({ length: 32 }).fill(0) as number[]),
        },
        await crypto.subtle.importKey('raw', masterKey, 'HKDF', false, ['deriveBits']),
        256,
      ),
    );

    return key;
  }

  async importEncryptionKey(key: string): Promise<void> {
    await this.set(ConfigurationKey.EncryptionKey, key);
  }

  async hasOnboardedKey() {
    return this.has(ConfigurationKey.OnboardedKey);
  }

  async confirmKeyOnboarded() {
    return this.set(ConfigurationKey.OnboardedKey, '1');
  }

  async hasTelemetry() {
    return this.has(ConfigurationKey.Telemetry);
  }

  async enableTelemetry() {
    return this.set(ConfigurationKey.Telemetry, 'full');
  }

  async hasSkippedExtraConfig() {
    return this.has(ConfigurationKey.SkippedOnboardingExtraConfig);
  }

  async skipExtraConfig() {
    return this.set(ConfigurationKey.SkippedOnboardingExtraConfig, '1');
  }

  async hasSessionSecret() {
    return this.has(ConfigurationKey.SessionSecret);
  }

  async getSessionSecret(): Promise<Buffer> {
    return Buffer.from(await this.get(ConfigurationKey.SessionSecret), 'hex');
  }

  async getResticOptions(
    placement: ResticPlacement,
  ): Promise<{ connections: number; packSizeMib: number | undefined }> {
    const siteCode = placement.siteCode ?? undefined;
    const clusterCode = placement.storageClusterCode ?? undefined;
    const cores = availableParallelism();

    const override = await this.getOptional(ConfigurationKey.ResticOptionRestConnections);
    const connections = override
      ? Number.parseInt(override)
      : ((await yuccaWellKnown.getConnections(cores, siteCode, clusterCode)) ?? cores);

    return { connections, packSizeMib: await yuccaWellKnown.getPackSizeMib(siteCode, clusterCode) };
  }
}
