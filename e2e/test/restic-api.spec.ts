import { backup, init, restore, snapshots } from '@futo-org/restic-wrapper';
import * as jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import env from 'src/env';

describe('restic API (e2e)', () => {
  const repository = randomUUID();
  const password = 'password';

  const rwToken = jwt.sign(
    {
      user: randomUUID(),
      repository,
      writeOnce: false,
    },
    env.JWT_SECRET,
  );

  const wormToken = jwt.sign(
    {
      user: randomUUID(),
      repository,
      writeOnce: true,
    },
    env.JWT_SECRET,
  );

  const repoUrl = `rest:http://restic:${rwToken}@localhost:${env.RESTIC_API_PORT}/${repository}/`;
  const wormUrl = `rest:http://restic:${wormToken}@localhost:${env.RESTIC_API_PORT}/${repository}/`;

  let workingDir;

  beforeAll(async () => {
    workingDir = tmpdir();

    await mkdir(resolve(workingDir, 'folder'), {
      recursive: true,
    });

    await writeFile(resolve(workingDir, 'folder', 'test-file'), 'test-file');
  });

  it('creates a repository', async () => {
    await init().repository(repoUrl).password(password).run();
  });

  it('creates a backup', async () => {
    await backup().repository(repoUrl).password(password).addFile(resolve(workingDir, 'folder')).run();
  });

  it.skip('restores the file', async () => {
    const [snapshot] = await snapshots().repository(repoUrl).password(password).run();

    await restore()
      .repository(repoUrl)
      .password(password)
      .snapshot(snapshot.id)
      .target(resolve(workingDir, 'restored'))
      .run();

    await stat(resolve(workingDir, 'restored', 'test-file'));
  });
});
