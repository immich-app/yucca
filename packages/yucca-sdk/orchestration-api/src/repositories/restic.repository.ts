import { backup, forget, init, keyList, ls, prune, restore, snapshots, stats, unlock } from '@futo-org/restic-wrapper';
import { Injectable } from '@nestjs/common';
import { Writable } from 'node:stream';
import { RepositorySnapshotRestoreRequestDto } from '../dto/repository.dto';
import { createSampledLogWriter, RetentionPolicy } from '../utils/restic';
import { ConfigRepository, ResticPlacement } from './config.repository';

@Injectable()
export class ResticRepository {
  constructor(private readonly config: ConfigRepository) {}

  async init(repository: string, key: Uint8Array, placement: ResticPlacement) {
    const { connections } = await this.config.getResticOptions(placement);
    await init()
      .option(`rest.connections=${connections}`)
      .repository(repository)
      .password(Buffer.from(key).toString('hex'))
      .run();
  }

  async backup(
    repository: string,
    key: Uint8Array,
    placement: ResticPlacement,
    paths: string[],
    logStream?: Writable,
    signal?: AbortSignal,
    tags: string[] = [],
  ) {
    const write = createSampledLogWriter(logStream);
    const { connections, packSizeMib } = await this.config.getResticOptions(placement);

    return await backup()
      .option(`rest.connections=${connections}`)
      .packSize(packSizeMib)
      .repository(repository)
      .password(Buffer.from(key).toString('hex'))
      .tag(...tags)
      .addFile(...paths)
      .signal(signal)
      .on('event', write)
      .run();
  }

  async restore(
    repository: string,
    key: Uint8Array,
    placement: ResticPlacement,
    snapshotId: string,
    { include, target }: RepositorySnapshotRestoreRequestDto,
    logStream?: Writable,
    signal?: AbortSignal,
  ) {
    const write = createSampledLogWriter(logStream);
    const { connections } = await this.config.getResticOptions(placement);

    let command = restore()
      .option(`rest.connections=${connections}`)
      .repository(repository)
      .password(Buffer.from(key).toString('hex'))
      .snapshot(snapshotId)
      .target(target ?? '/')
      .signal(signal)
      .on('event', write);

    if (include) {
      command = command.include(...include);
    }

    return await command.run();
  }

  async ls(repository: string, key: Uint8Array, placement: ResticPlacement, snapshotId: string, path: string) {
    const { connections } = await this.config.getResticOptions(placement);
    return await ls()
      .option(`rest.connections=${connections}`)
      .repository(repository)
      .password(Buffer.from(key).toString('hex'))
      .snapshot(snapshotId)
      .directory(path)
      .run();
  }

  async stats(repository: string, key: Uint8Array, placement: ResticPlacement) {
    const { connections } = await this.config.getResticOptions(placement);
    return await stats()
      .option(`rest.connections=${connections}`)
      .repository(repository)
      .password(Buffer.from(key).toString('hex'))
      .modeRawData()
      .run();
  }

  async snapshots(repository: string, key: Uint8Array, placement: ResticPlacement) {
    const { connections } = await this.config.getResticOptions(placement);
    return await snapshots()
      .option(`rest.connections=${connections}`)
      .repository(repository)
      .password(Buffer.from(key).toString('hex'))
      .run();
  }

  async snapshot(repository: string, key: Uint8Array, placement: ResticPlacement, snapshotId: string) {
    const { connections } = await this.config.getResticOptions(placement);
    return await snapshots()
      .option(`rest.connections=${connections}`)
      .repository(repository)
      .password(Buffer.from(key).toString('hex'))
      .snapshot(snapshotId)
      .run();
  }

  async forget(
    repository: string,
    key: Uint8Array,
    placement: ResticPlacement,
    snapshotId: string,
    prune = true,
    signal?: AbortSignal,
  ) {
    const { connections } = await this.config.getResticOptions(placement);
    return await forget()
      .option(`rest.connections=${connections}`)
      .repository(repository)
      .password(Buffer.from(key).toString('hex'))
      .snapshot(snapshotId)
      .prune(prune)
      .signal(signal)
      .run();
  }

  async forgetByPolicy(
    repository: string,
    key: Uint8Array,
    placement: ResticPlacement,
    policy: RetentionPolicy,
    signal?: AbortSignal,
  ) {
    const { connections } = await this.config.getResticOptions(placement);
    return await forget()
      .option(`rest.connections=${connections}`)
      .repository(repository)
      .password(Buffer.from(key).toString('hex'))
      .signal(signal)
      .keepLast(policy.keepLast)
      .keepWithin(policy.keepWithin)
      .keepWithinHourly(policy.keepWithinHourly)
      .keepWithinDaily(policy.keepWithinDaily)
      .keepWithinWeekly(policy.keepWithinWeekly)
      .keepWithinMonthly(policy.keepWithinMonthly)
      .keepWithinYearly(policy.keepWithinYearly)
      .run();
  }

  async prune(repository: string, key: Uint8Array, placement: ResticPlacement, signal?: AbortSignal) {
    const { connections, packSizeMib } = await this.config.getResticOptions(placement);
    return await prune()
      .option(`rest.connections=${connections}`)
      .packSize(packSizeMib)
      .repository(repository)
      .password(Buffer.from(key).toString('hex'))
      .signal(signal)
      .run();
  }

  async keyList(repository: string, key: Uint8Array, placement: ResticPlacement) {
    const { connections } = await this.config.getResticOptions(placement);
    return await keyList()
      .option(`rest.connections=${connections}`)
      .repository(repository)
      .password(Buffer.from(key).toString('hex'))
      .run();
  }

  async unlockAll(repository: string, key: Uint8Array, placement: ResticPlacement) {
    const { connections } = await this.config.getResticOptions(placement);
    return await unlock()
      .option(`rest.connections=${connections}`)
      .removeAll()
      .repository(repository)
      .password(Buffer.from(key).toString('hex'))
      .run();
  }
}
