import { env } from '@common/server/env';
import {
  backup,
  cache,
  cat,
  check,
  copy,
  diff,
  dump,
  find,
  forget,
  init,
  keyAdd,
  keyList,
  keyRemove,
  list,
  ls,
  prune,
  recover,
  repair,
  restore,
  rewrite,
  snapshots,
  stats,
  tag,
  unlock,
} from '@futo-org/restic-wrapper';
import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const password = 'password';

function generateRepoUrl(repository: string, writeOnce: boolean) {
  const token = jwt.sign(
    {
      user: randomUUID(),
      repository,
      writeOnce,
    },
    env.JWT_SECRET,
  );

  return {
    token,
    repoUrl: `rest:http://restic:${token}@localhost:${env.RESTIC_API_PORT}/${repository}/`,
  };
}

function generateCase(writeOnce: boolean) {
  const repository = randomUUID();
  const { repoUrl } = generateRepoUrl(repository, writeOnce);

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

    await writeFile(join(workingDir, 'pwd'), 'password');
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

  describe('cache', () => {
    it('returns cache directories', async () => {
      await expect(cache().repository(repoUrl).password('password').run()).resolves.toEqual(
        expect.objectContaining({
          directories: expect.any(Number),
          table: expect.arrayContaining([
            expect.objectContaining({
              'Last Used': expect.any(String),
              Old: false,
              'Repo ID': expect.any(String),
              Size: expect.any(String),
            }),
          ]),
        }),
      );
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

  describe('copy', () => {
    let otherRepoUrl: string;

    beforeEach(async () => {
      otherRepoUrl = generateCase(writeOnce).repoUrl;
      await init().repository(otherRepoUrl).password(password).run();
    }, 10_000);

    it('copies everything to new repository', async () => {
      await copy()
        .fromRepo(repoUrl)
        .fromPasswordFile(join(workingDir, 'pwd'))
        .repository(otherRepoUrl)
        .password('password')
        .run();

      await expect(snapshots().repository(otherRepoUrl).password('password').run()).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            paths: expect.arrayContaining([expect.stringContaining('folder')]),
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

      await mkdir(resolve(workingDir, 'diff'), {
        recursive: true,
      });

      await writeFile(resolve(workingDir, 'diff', 'test-file'), 'data');
      await writeFile(resolve(workingDir, 'diff', 'deleted-file'), 'data');

      const { snapshot_id: snapshot_a } = await backup()
        .repository(repoUrl)
        .password(password)
        .addFile(resolve(diffWorkingDir, 'diff', 'test-file'))
        .addFile(resolve(diffWorkingDir, 'diff', 'deleted-file'))
        .run();

      await writeFile(resolve(workingDir, 'diff', 'test-file'), 'changed data');
      await writeFile(resolve(workingDir, 'diff', 'new-file'), 'new data');

      const { snapshot_id: snapshot_b } = await backup()
        .repository(repoUrl)
        .password(password)
        .addFile(resolve(diffWorkingDir, 'diff', 'test-file'))
        .addFile(resolve(diffWorkingDir, 'diff', 'new-file'))
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

  describe('dump', () => {
    let snapshotId: string;

    beforeEach(async () => {
      const result = await backup().repository(repoUrl).password(password).addFile(resolve(workingDir, 'folder')).run();
      snapshotId = result.snapshot_id;
    });

    it('dumps file to stdout', async () => {
      const buffer = await dump()
        .repository(repoUrl)
        .password('password')
        .snapshot(snapshotId)
        .file(join(workingDir, 'folder', 'test-file'))
        .run();

      expect(buffer.toString()).toBe('test-file');
    });

    it('dumps folder as tar', async () => {
      const buffer = await dump()
        .repository(repoUrl)
        .password('password')
        .snapshot(snapshotId)
        .file(join(workingDir, 'folder'))
        .run();

      expect(buffer.subarray(257, 262).toString()).toBe('ustar');
      expect(buffer.length).toBeGreaterThanOrEqual(512);
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

  describe('keyAdd & keyRemove', () => {
    let keyId: string;

    it('adds a new key', async () => {
      await keyAdd().repository(repoUrl).password(password).newInsecureNoPassword().run();

      const keys = await keyList().repository(repoUrl).insecureNoPassword().run();
      expect(keys.length).toBe(2);

      keyId = keys.find((key) => key.current)!.id;
    }, 10_000);

    if (writeOnce) {
      it('fails to remove the new key', async () => {
        await expect(keyRemove().repository(repoUrl).password(password).keyId(keyId).run()).rejects.toThrow();
      });
    } else {
      it('removes the new key', async () => {
        await keyRemove().repository(repoUrl).password(password).keyId(keyId).run();

        const keys = await keyList().repository(repoUrl).password(password).run();
        expect(keys.length).toBe(1);
      });
    }
  });

  describe('list', () => {
    it.each(['blobs', 'packs', 'index', 'snapshots', 'keys', 'locks'])('lists %s', async (type) => {
      const items = await list()
        .repository(repoUrl)
        .password('password')
        .type(type as any)
        .run();

      expect(Array.isArray(items)).toBe(true);
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

  describe('prune', () => {
    async function createPruneRepo() {
      const { repoUrl: pruneRepoUrl } = generateCase(writeOnce);
      await init().repository(pruneRepoUrl).password(password).run();
      return pruneRepoUrl;
    }

    async function createForgottenSnapshot(pruneRepoUrl: string) {
      const file = join(workingDir, `prune-${randomUUID()}.txt`);
      await writeFile(file, randomUUID());

      const { snapshot_id } = await backup().repository(pruneRepoUrl).password(password).addFile(file).run();
      await forget().repository(pruneRepoUrl).password(password).snapshot(snapshot_id).run();
      return snapshot_id;
    }

    if (writeOnce) {
      it('keeps snapshots after forget and allows no-op prune', async () => {
        const pruneRepoUrl = await createPruneRepo();
        const snapshotId = await createForgottenSnapshot(pruneRepoUrl);
        const allSnapshots = await snapshots().repository(pruneRepoUrl).password(password).run();

        expect(allSnapshots).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: snapshotId,
            }),
          ]),
        );

        const output = await prune().repository(pruneRepoUrl).password(password).run();
        expect(output).toMatch(/total prune:\s+0 blobs/);
      }, 15_000);

      it("can't delete data via prune in WORM repo when prune has work to do", async () => {
        const repository = randomUUID();
        const { repoUrl: mutableRepoUrl } = generateRepoUrl(repository, false);
        const { repoUrl: wormRepoUrl } = generateRepoUrl(repository, true);

        await init().repository(mutableRepoUrl).password(password).run();
        const snapshotId = await createForgottenSnapshot(mutableRepoUrl);

        await expect(snapshots().repository(mutableRepoUrl).password(password).run()).resolves.toEqual(
          expect.not.arrayContaining([
            expect.objectContaining({
              id: snapshotId,
            }),
          ]),
        );

        await expect(prune().repository(wormRepoUrl).password(password).run()).rejects.toThrow();
      }, 20_000);
    } else {
      it('prunes old data', async () => {
        const pruneRepoUrl = await createPruneRepo();
        await createForgottenSnapshot(pruneRepoUrl);

        const blobsBefore = await list().repository(pruneRepoUrl).password(password).type('blobs').run();
        await prune().repository(pruneRepoUrl).password(password).run();
        const blobsAfter = await list().repository(pruneRepoUrl).password(password).type('blobs').run();

        expect(blobsBefore).not.toEqual(blobsAfter);
      }, 15_000);
    }
  });

  describe('recover', () => {
    beforeEach(async () => {
      const { snapshot_id } = await backup()
        .repository(repoUrl)
        .password('password')
        .addFile(join(workingDir, 'pwd'))
        .run();

      await forget().repository(repoUrl).password('password').snapshot(snapshot_id).run();
    });

    if (writeOnce) {
      it('fails to generate snapshot from raw data (mutable operation)', async () => {
        await expect(recover().repository(repoUrl).password('password').run()).rejects.toThrow();
      });
    } else {
      it('generates a new snapshot from raw data', async () => {
        await recover().repository(repoUrl).password('password').run();

        await expect(snapshots().repository(repoUrl).password('password').run()).resolves.toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              tags: ['recovered'],
            }),
          ]),
        );
      });
    }
  });

  describe('repair', () => {
    if (writeOnce) {
      it('fails to generate a new index', async () => {
        await expect(repair().repository(repoUrl).password('password').index().run()).rejects.toThrow();
      });

      it('fails to repair packs', async () => {
        const packs = await list().repository(repoUrl).password('password').type('packs').run();
        await expect(
          repair()
            .repository(repoUrl)
            .password('password')
            .pack(...packs)
            .run(),
        ).rejects.toThrow();
      });
    } else {
      it('generates a new index', async () => {
        await repair().repository(repoUrl).password('password').index().run();
      });

      it('repairs packs', async () => {
        const packs = await list().repository(repoUrl).password('password').type('packs').run();
        await repair()
          .repository(repoUrl)
          .password('password')
          .pack(...packs)
          .run();
      });
    }

    it('repairs snapshots', async () => {
      await repair().repository(repoUrl).password('password').snapshots().run();
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

  describe('rewrite', () => {
    let snapshotId: string;

    beforeEach(async () => {
      const result = await backup().repository(repoUrl).password(password).addFile(resolve(workingDir, 'folder')).run();
      snapshotId = result.snapshot_id;
    });

    it('rewrite one snapshot', async () => {
      const listBefore = await snapshots().repository(repoUrl).password('password').run();
      await rewrite().repository(repoUrl).password('password').snapshot(snapshotId).exclude('hello.json').run();
      const listAfter = await snapshots().repository(repoUrl).password('password').run();
      expect(listAfter.length).toBe(listBefore.length + 1);
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

  describe('unlock', () => {
    it('works', async () => {
      await unlock().repository(repoUrl).password('password').run();
    });
  });
});
