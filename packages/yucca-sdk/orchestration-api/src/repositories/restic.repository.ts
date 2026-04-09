import { backup, forget, init, snapshots, stats } from '@futo-org/restic-wrapper';
import { Injectable } from '@nestjs/common';
import { Writable } from 'node:stream';

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
}
