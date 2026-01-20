import {
  backup,
  cat,
  check,
  diff,
  find,
  forget,
  init,
  keyList,
  ls,
  restore,
  snapshots,
  stats,
  tag,
} from '@futo-org/restic-wrapper';
import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import env from 'src/env';

const password = 'password';

function generateCase(writeOnce: boolean) {
  const repository = randomUUID();

  const token = jwt.sign(
    {
      user: randomUUID(),
      repository,
      writeOnce,
    },
    env.JWT_SECRET,
  );

  const repoUrl = `rest:http://restic:${token}@localhost:${env.RESTIC_API_PORT}/${repository}/`;

  return {
    repository,
    repoUrl,
  };
}

describe.each([
  { name: 'restic API', ...generateCase(false), writeOnce: false },
  { name: 'restic WORM API', ...generateCase(true), writeOnce: true },
])('$name (e2e)', ({ writeOnce, repoUrl }) => {
  let workingDir;

  beforeAll(async () => {
    workingDir = tmpdir();

    await mkdir(resolve(workingDir, 'folder'), {
      recursive: true,
    });

    await writeFile(resolve(workingDir, 'folder', 'test-file'), 'test-file');
    await writeFile(resolve(workingDir, 'folder', 'hello.json'), '{}');
  });

  describe('init', () => {
    jest.retryTimes(2);

    it('creates a repository', async () => {
      await init().repository(repoUrl).password(password).run();
    }, 10_000);
  });

  describe('backup', () => {
    it('creates a backup', async () => {
      await backup().repository(repoUrl).password(password).addFile(resolve(workingDir, 'folder')).run();
    });
  });

  describe('cat', () => {
    it('can read config', async () => {
      expect(await cat().repository(repoUrl).password(password).target('config').run()).toEqual(
        expect.objectContaining({
          version: expect.any(Number),
        }),
      );
    });
  });

  describe('check', () => {
    it('can check repository', async () => {
      expect(await check().repository(repoUrl).password(password).run()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            num_errors: 0,
          }),
        ]),
      );
    });
  });

  describe('diff', () => {
    let snapshotA: string;
    let snapshotB: string;

    beforeEach(async () => {
      const diffWorkingDir = tmpdir();

      await mkdir(resolve(workingDir, 'folder'), {
        recursive: true,
      });

      await writeFile(resolve(workingDir, 'folder', 'test-file'), 'data');
      await writeFile(resolve(workingDir, 'folder', 'deleted-file'), 'data');

      const { snapshot_id: snapshot_a } = await backup()
        .repository(repoUrl)
        .password(password)
        .addFile(resolve(diffWorkingDir, 'folder', 'test-file'))
        .addFile(resolve(diffWorkingDir, 'folder', 'deleted-file'))
        .run();

      await writeFile(resolve(workingDir, 'folder', 'test-file'), 'changed data');
      await writeFile(resolve(workingDir, 'folder', 'new-file'), 'new data');

      const { snapshot_id: snapshot_b } = await backup()
        .repository(repoUrl)
        .password(password)
        .addFile(resolve(diffWorkingDir, 'folder', 'test-file'))
        .addFile(resolve(diffWorkingDir, 'folder', 'new-file'))
        .run();

      snapshotA = snapshot_a;
      snapshotB = snapshot_b;
    });

    it('correctly produces a diff', async () => {
      await expect(diff().repository(repoUrl).password(password).compare(snapshotA, snapshotB).run()).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringMatching(/deleted-file/),
            modifier: '-',
          }),
          expect.objectContaining({
            path: expect.stringMatching(/new-file/),
            modifier: '+',
          }),
          expect.objectContaining({
            path: expect.stringMatching(/test-file/),
            modifier: 'M',
          }),
          expect.objectContaining({
            source_snapshot: snapshotA,
            target_snapshot: snapshotB,
            added: expect.objectContaining({
              files: 1,
            }),
            removed: expect.objectContaining({
              files: 1,
            }),
          }),
        ]),
      );
    });
  });

  describe('find', () => {
    let snapshotId: string;

    beforeEach(async () => {
      const result = await backup().repository(repoUrl).password(password).addFile(resolve(workingDir, 'folder')).run();
      snapshotId = result.snapshot_id;
    });

    it('finds objects', async () => {
      await expect(find().repository(repoUrl).password(password).match('*.json').object().run()).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            hits: 1,
            snapshot: snapshotId,
            matches: expect.arrayContaining([
              expect.objectContaining({
                path: expect.stringContaining('hello.json'),
              }),
            ]),
          }),
        ]),
      );
    });
  });

  describe('forget', () => {
    let snapshotId: string;

    beforeEach(async () => {
      const result = await backup().repository(repoUrl).password(password).addFile(resolve(workingDir, 'folder')).run();
      snapshotId = result.snapshot_id;
    });

    it(writeOnce ? 'does not forget snapshot' : 'forgets snapshot', async () => {
      await forget().repository(repoUrl).password(password).snapshot(snapshotId).run();
      await expect(snapshots().repository(repoUrl).password(password).run()).resolves.toEqual(
        writeOnce
          ? expect.arrayContaining([
              expect.objectContaining({
                id: snapshotId,
              }),
            ])
          : expect.not.arrayContaining([
              expect.objectContaining({
                id: snapshotId,
              }),
            ]),
      );
    });
  });

  describe('keyList', () => {
    it('lists keys', async () => {
      const keys = await keyList().repository(repoUrl).password(password).run();

      expect(keys.length).toBe(1);
      expect(keys[0].current).toBeTruthy();
    });
  });

  describe('ls', () => {
    let snapshotId: string;

    beforeEach(async () => {
      const result = await backup().repository(repoUrl).password(password).addFile(resolve(workingDir, 'folder')).run();
      snapshotId = result.snapshot_id;
    });

    it('provides a file listing', async () => {
      await expect(ls().repository(repoUrl).password(password).snapshot(snapshotId).run()).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message_type: 'snapshot',
            id: snapshotId,
          }),
          expect.objectContaining({
            path: expect.stringContaining('test-file'),
          }),
          expect.objectContaining({
            path: expect.stringContaining('hello.json'),
          }),
        ]),
      );
    });
  });

  describe('restore', () => {
    let snapshotId: string;

    beforeEach(async () => {
      const result = await backup().repository(repoUrl).password(password).addFile(resolve(workingDir, 'folder')).run();
      snapshotId = result.snapshot_id;
    });

    it('restores a file', async () => {
      await restore()
        .repository(repoUrl)
        .password(password)
        .snapshot(snapshotId)
        .target(resolve(workingDir, 'restored'))
        .run();

      await stat(resolve(workingDir, 'restored', workingDir, 'folder', 'test-file'));
    });
  });

  describe('snapshots', () => {
    let snapshotId: string;

    beforeEach(async () => {
      const result = await backup().repository(repoUrl).password(password).addFile(resolve(workingDir, 'folder')).run();
      snapshotId = result.snapshot_id;
    });

    it('lists snapshots', async () => {
      await expect(snapshots().repository(repoUrl).password(password).run()).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: snapshotId,
          }),
        ]),
      );
    });
  });

  describe('stats', () => {
    it('generates stats', async () => {
      await expect(stats().repository(repoUrl).password(password).run()).resolves.toEqual(
        expect.objectContaining({
          total_size: expect.any(Number),
          total_file_count: expect.any(Number),
          snapshots_count: expect.any(Number),
        }),
      );
    });
  });

  describe('tag', () => {
    let snapshotId: string;

    beforeEach(async () => {
      const result = await backup().repository(repoUrl).password(password).addFile(resolve(workingDir, 'folder')).run();
      snapshotId = result.snapshot_id;
    });

    it('updates a specific snapshot', async () => {
      await tag().repository(repoUrl).password(password).set('new-tag').snapshot(snapshotId).run();

      await expect(snapshots().repository(repoUrl).password(password).run()).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            tags: ['new-tag'],
          }),
        ]),
      );
    });
  });
});
