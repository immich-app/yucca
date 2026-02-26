import { backup, forget, init, snapshots, stats } from '@futo-org/restic-wrapper';
import { Injectable } from '@nestjs/common';
import { Writable } from 'node:stream';

@Injectable()
export class ResticRepository {
  async init(repository: string, key: Buffer) {
    await init().repository(repository).password(key.toString('hex')).run();
  }

  async backup(repository: string, key: Buffer, paths: string[], logStream?: Writable) {
    await backup()
      .repository(repository)
      .password(key.toString('hex'))
      .addFile(...paths)
      .on('event', (event) => logStream?.write(JSON.stringify(event) + '\n'))
      .run();
  }

  async stats(repository: string, key: Buffer) {
    return await stats().repository(repository).password(key.toString('hex')).modeRawData().run();
  }

  async snapshots(repository: string, key: Buffer) {
    return await snapshots().repository(repository).password(key.toString('hex')).run();
  }

  async forget(repository: string, key: Buffer, snapshotId: string, prune = true) {
    return await forget().repository(repository).password(key.toString('hex')).snapshot(snapshotId).prune(prune).run();
  }
}
