import { Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { randomBytes } from 'node:crypto';
import { availableParallelism } from 'node:os';
import { ConfigurationKey } from '../enum';
import { DB } from '../schema';
import { yuccaWellKnown } from '../wellKnown';

@Injectable()
export class ConfigRepository {
  private readonly placementByResticTarget = new Map<string, { siteCode: string; clusterCode: string }>();

  constructor(@InjectKysely('orchestrator') private db: Kysely<DB>) {}

  private resticTargetKey(repository: string): string {
    if (!repository.startsWith('rest:')) {
      return repository;
    }
    const url = new URL(repository.slice('rest:'.length));
    url.username = '';
    url.password = '';
    return url.href;
  }

  registerResticPlacement(repository: string, siteCode: string | null, clusterCode: string | null): void {
    if (siteCode && clusterCode) {
      this.placementByResticTarget.set(this.resticTargetKey(repository), { siteCode, clusterCode });
    }
  }

  private placement(repository: string) {
    return this.placementByResticTarget.get(this.resticTargetKey(repository));
  }

  async bootstrap() {
    const hasKey = await this.hasEncryptionKey();

    if (!hasKey) {
      await this.set(ConfigurationKey.EncryptionKey, randomBytes(32).toString('hex'));
    }
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

  // Precedence: explicit local override > the environment's /meta
  // connections_math (evaluated for this machine) > local core count.
  async getResticOptionRestConnections(repository = '') {
    const concurrency = await this.getOptional(ConfigurationKey.ResticOptionRestConnections);
    if (concurrency) {
      return Number.parseInt(concurrency);
    }

    const placement = this.placement(repository);
    const cores = availableParallelism();
    const fromMeta = placement
      ? await yuccaWellKnown.getConnections(cores, placement.siteCode, placement.clusterCode)
      : await yuccaWellKnown.getConnections(cores);
    return fromMeta ?? availableParallelism();
  }

  // Server-advertised restic --pack-size (MiB); undefined leaves restic's
  // default in place (e.g. when discovery is unreachable).
  getResticPackSizeMib(repository = ''): Promise<number | undefined> {
    const placement = this.placement(repository);
    return placement
      ? yuccaWellKnown.getPackSizeMib(placement.siteCode, placement.clusterCode)
      : yuccaWellKnown.getPackSizeMib();
  }
}
