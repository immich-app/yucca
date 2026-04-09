import { backup, forget, init, keyList, ls, restore, snapshots, stats } from '@futo-org/restic-wrapper';
import { Injectable } from '@nestjs/common';
import { Writable } from 'node:stream';
import { RepositorySnapshotRestoreRequestDto } from '../dto/repository.dto';

@Injectable()
export class ResticRepository {
  async init(repository: string, key: Uint8Array) {
    await init().repository(repository).password(Buffer.from(key).toString('hex')).run();
  }

  async backup(repository: string, key: Uint8Array, paths: string[], logStream?: Writable) {
    await backup()
      .repository(repository)
      .password(Buffer.from(key).toString('hex'))
      .addFile(...paths)
      .on('event', (event) => logStream?.write(JSON.stringify(event) + '\n'))
      .run();
  }

  async restore(
    repository: string,
    key: Uint8Array,
    snapshotId: string,
    { include, target }: RepositorySnapshotRestoreRequestDto,
    logStream?: Writable,
  ) {
    let command = restore()
      .repository(repository)
      .password(Buffer.from(key).toString('hex'))
      .snapshot(snapshotId)
      .target(target ?? '/')
      .on('event', (event) => logStream?.write(JSON.stringify(event) + '\n'));

    if (include) {
      command = command.include(...include);
    }

    return command.run();
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

  async forget(repository: string, key: Uint8Array, snapshotId: string, prune = true) {
    return await forget()
      .repository(repository)
      .password(Buffer.from(key).toString('hex'))
      .snapshot(snapshotId)
      .prune(prune)
      .run();
  }

  async keyList(repository: string, key: Uint8Array) {
    return await keyList().repository(repository).password(Buffer.from(key).toString('hex')).run();
  }
}
