import { backup, forget, init, keyList, ls, prune, restore, snapshots, stats, unlock } from '@futo-org/restic-wrapper';
import { Injectable } from '@nestjs/common';
import { Writable } from 'node:stream';
import { RepositorySnapshotRestoreRequestDto } from '../dto/repository.dto';
import { createSampledLogWriter, RetentionPolicy } from '../utils/restic';
import { ConfigRepository } from './config.repository';

@Injectable()
export class ResticRepository {
  constructor(private readonly config: ConfigRepository) {}

  async init(repository: string, key: Uint8Array) {
    await init()
      .option(`rest.connections=${await this.config.getResticOptionRestConnections()}`)
      .repository(repository)
      .password(Buffer.from(key).toString('hex'))
      .run();
  }

  async backup(repository: string, key: Uint8Array, paths: string[], logStream?: Writable, signal?: AbortSignal) {
    const write = createSampledLogWriter(logStream);

    return await backup()
      .option(`rest.connections=${await this.config.getResticOptionRestConnections()}`)
      .repository(repository)
      .password(Buffer.from(key).toString('hex'))
      .addFile(...paths)
      .signal(signal)
      .on('event', write)
      .run();
  }

  async restore(
    repository: string,
    key: Uint8Array,
    snapshotId: string,
    { include, target }: RepositorySnapshotRestoreRequestDto,
    logStream?: Writable,
    signal?: AbortSignal,
  ) {
    const write = createSampledLogWriter(logStream);

    let command = restore()
      .option(`rest.connections=${await this.config.getResticOptionRestConnections()}`)
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

  async ls(repository: string, key: Uint8Array, snapshotId: string, path: string) {
    return await ls()
      .option(`rest.connections=${await this.config.getResticOptionRestConnections()}`)
      .repository(repository)
      .password(Buffer.from(key).toString('hex'))
      .snapshot(snapshotId)
      .directory(path)
      .run();
  }

  async stats(repository: string, key: Uint8Array) {
    return await stats()
      .option(`rest.connections=${await this.config.getResticOptionRestConnections()}`)
      .repository(repository)
      .password(Buffer.from(key).toString('hex'))
      .modeRawData()
      .run();
  }

  async snapshots(repository: string, key: Uint8Array) {
    return await snapshots()
      .option(`rest.connections=${await this.config.getResticOptionRestConnections()}`)
      .repository(repository)
      .password(Buffer.from(key).toString('hex'))
      .run();
  }

  async forget(repository: string, key: Uint8Array, snapshotId: string, prune = true, signal?: AbortSignal) {
    return await forget()
      .option(`rest.connections=${await this.config.getResticOptionRestConnections()}`)
      .repository(repository)
      .password(Buffer.from(key).toString('hex'))
      .snapshot(snapshotId)
      .prune(prune)
      .signal(signal)
      .run();
  }

  async forgetByPolicy(repository: string, key: Uint8Array, policy: RetentionPolicy, signal?: AbortSignal) {
    return await forget()
      .option(`rest.connections=${await this.config.getResticOptionRestConnections()}`)
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

  async prune(repository: string, key: Uint8Array, signal?: AbortSignal) {
    return await prune()
      .option(`rest.connections=${await this.config.getResticOptionRestConnections()}`)
      .repository(repository)
      .password(Buffer.from(key).toString('hex'))
      .signal(signal)
      .run();
  }

  async keyList(repository: string, key: Uint8Array) {
    return await keyList()
      .option(`rest.connections=${await this.config.getResticOptionRestConnections()}`)
      .repository(repository)
      .password(Buffer.from(key).toString('hex'))
      .run();
  }

  async unlockAll(repository: string, key: Uint8Array) {
    return await unlock()
      .option(`rest.connections=${await this.config.getResticOptionRestConnections()}`)
      .removeAll()
      .repository(repository)
      .password(Buffer.from(key).toString('hex'))
      .run();
  }
}
