import { backup, forget, init, keyList, ls, prune, restore, snapshots, stats, unlock } from '@futo-org/restic-wrapper';
import { Injectable } from '@nestjs/common';
import { Writable } from 'node:stream';
import { RepositorySnapshotRestoreRequestDto } from '../dto/repository.dto';
import { createSampledLogWriter, RetentionPolicy } from '../utils/restic';

@Injectable()
export class ResticRepository {
  async init(repository: string, key: Uint8Array) {
    await init().repository(repository).password(Buffer.from(key).toString('hex')).run();
  }

  async backup(repository: string, key: Uint8Array, paths: string[], logStream?: Writable, signal?: AbortSignal) {
    const write = createSampledLogWriter(logStream);

    await backup()
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
      .repository(repository)
      .password(Buffer.from(key).toString('hex'))
      .snapshot(snapshotId)
      .target(target ?? '/')
      .signal(signal)
      .on('event', write);

    if (include) {
      command = command.include(...include);
    }

    await command.run();
  }

  async ls(repository: string, key: Uint8Array, snapshotId: string, path: string) {
    return await ls()
      .repository(repository)
      .password(Buffer.from(key).toString('hex'))
      .snapshot(snapshotId)
      .directory(path)
      .run();
  }

  async stats(repository: string, key: Uint8Array) {
    return await stats().repository(repository).password(Buffer.from(key).toString('hex')).modeRawData().run();
  }

  async snapshots(repository: string, key: Uint8Array) {
    return await snapshots().repository(repository).password(Buffer.from(key).toString('hex')).run();
  }

  async forget(repository: string, key: Uint8Array, snapshotId: string, prune = true, signal?: AbortSignal) {
    return await forget()
      .repository(repository)
      .password(Buffer.from(key).toString('hex'))
      .snapshot(snapshotId)
      .prune(prune)
      .signal(signal)
      .run();
  }

  async forgetByPolicy(repository: string, key: Uint8Array, policy: RetentionPolicy, signal?: AbortSignal) {
    return await forget()
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

  prune(repository: string, key: Uint8Array, signal?: AbortSignal) {
    return prune().repository(repository).password(Buffer.from(key).toString('hex')).signal(signal).run();
  }

  async keyList(repository: string, key: Uint8Array) {
    return await keyList().repository(repository).password(Buffer.from(key).toString('hex')).run();
  }

  async unlockAll(repository: string, key: Uint8Array) {
    return await unlock()
      // @ts-expect-error needs restic-wrapper-ts bump
      .removeAll()
      .repository(repository)
      .password(Buffer.from(key).toString('hex'))
      .run();
  }
}
