import { createEventSource } from 'eventsource-client';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as sdk from 'orchestration-ui/sdk';
import { io } from 'socket.io-client';

const baseUrl = `http://localhost:22676`;
const socket = io(baseUrl, {
  transports: ['websocket'],
});

const waitForMessage = (type: string) => {
  return new Promise((resolve) => {
    const listener = (msg: string) => {
      const payload = JSON.parse(msg);
      if (payload.type !== type) return;

      resolve(payload);
      socket.offAny(listener);
    };

    socket.onAny(listener);
  });
};

// TODO: process is already running so we can't do this
describe.skip('Onboarding (before setup)', () => {
  it('should report onboarding has not been performed', async () => {
    await expect(sdk.onboardingStatus()).resolves.toEqual({
      hasBackend: false,
      hasOnboardedKey: false,
    });
  });
});

describe('Auth', () => {
  it('should log us in using IdP', async () => {
    const { headers: loginHeaders } = await fetch(`${baseUrl}/api/auth/oidc/login`, {
      redirect: 'manual',
    });

    const { headers: nextHopHeaders } = await fetch(loginHeaders.get('Location')!, {
      redirect: 'manual',
    });

    const redirectUrl = new URL(nextHopHeaders.get('Location')!);
    redirectUrl.pathname = '/api/form';
    redirectUrl.searchParams.set('sub', 'bar');

    const { headers: oidcHeaders } = await fetch(redirectUrl, {
      redirect: 'manual',
    });

    await fetch(oidcHeaders.get('Location'), {
      redirect: 'manual',
      headers: {
        Cookie: loginHeaders.getSetCookie().join('; '),
      },
    });
  });
});

describe('Backend', () => {
  it('lists yucca as active backend', async () => {
    await expect(sdk.getBackends()).resolves.toEqual(
      expect.objectContaining({
        backends: [
          expect.objectContaining({
            id: expect.any(String),
            type: 'yucca',
            isOnline: true,
          }),
        ],
      }),
    );
  });
});

describe('Filesystem', () => {
  it('works', async () => {
    await sdk.getFileListing();
  });
});

// TODO: need to be able to reset the orchestrator
describe.skip('Onboarding', () => void 0);

describe('Repository', () => {
  let repository: sdk.LocalRepositoryDto;

  beforeAll(async () => {
    ({ repository } = await sdk.createRepository({
      name: 'Test Repository',
      worm: false,
    }));
  });

  it('lists repositories', async () => {
    await expect(sdk.getRepositories()).resolves.toEqual({
      repositories: expect.arrayContaining([
        expect.objectContaining({
          id: repository.id,
        }),
      ]),
    });
  });

  it('creates a repository', async () => {
    const event = waitForMessage('RepositoryCreate');

    await expect(
      sdk.createRepository({
        name: 'My Repository',
        worm: false,
      }),
    ).resolves.toEqual({
      repository: expect.objectContaining({
        name: 'My Repository',
      }),
    });

    await expect(event).resolves.toEqual({
      type: 'RepositoryCreate',
      repository: expect.objectContaining({
        name: 'My Repository',
      }),
    });
  });

  it('updates a repository', async () => {
    const addEvent = waitForMessage('RepositoryUpdate');

    await sdk.addRepositoryPath(repository.id, {
      path: '/test',
    });

    await expect(addEvent).resolves.toEqual({
      type: 'RepositoryUpdate',
      repositoryId: repository.id,
      repository: expect.objectContaining({
        configuration: {
          paths: ['/test'],
        },
      }),
    });

    const removeEvent = waitForMessage('RepositoryUpdate');

    await sdk.removeRepositoryPath(repository.id, {
      path: '/test',
    });

    await expect(removeEvent).resolves.toEqual({
      type: 'RepositoryUpdate',
      repositoryId: repository.id,
      repository: expect.objectContaining({
        configuration: {
          paths: [],
        },
      }),
    });
  });

  it('creates a backup', async () => {
    const workingDir = await mkdtemp(join(tmpdir(), 'test-'));
    await writeFile(join(workingDir, 'test-file'), 'hi');

    await sdk.addRepositoryPath(repository.id, {
      path: workingDir,
    });

    const startEvent = waitForMessage('TaskStart');
    const endEvent = waitForMessage('TaskEnd');
    const updateEvent = waitForMessage('RepositoryUpdate');

    const { logId } = await sdk.createBackup(repository.id);

    const events = createEventSource(`${baseUrl}/api/repository/logs/${logId}`);

    for await (const { data } of events) {
      const payload = JSON.parse(data);

      expect(payload).toBeOneOf([
        expect.objectContaining({
          message_type: 'summary',
        }),
        expect.objectContaining({
          message_type: 'status',
          percent_done: expect.any(Number),
        }),
      ]);

      if (payload.message_type === 'summary') {
        break;
      }
    }

    events.close();

    await expect(startEvent).resolves.toEqual({
      type: 'TaskStart',
      task: {
        type: 'backup',
        parentId: repository.id,
        logId,
      },
    });

    await expect(endEvent).resolves.toEqual({
      type: 'TaskEnd',
      parentId: repository.id,
    });

    await expect(updateEvent).resolves.toEqual({
      type: 'RepositoryUpdate',
      repositoryId: repository.id,
      repository: expect.objectContaining({
        metrics: {
          lastBackup: expect.any(String),
          sizeBytes: expect.any(Number),
        },
      }),
    });
  }, 10_000);

  it('lists run history', async () => {
    await expect(sdk.getRunHistory(repository.id)).resolves.toEqual({
      runs: expect.arrayContaining([
        expect.objectContaining({
          id: expect.any(String),
          status: 'complete',
        }),
      ]),
    });
  });

  it('list snapshots', async () => {
    await expect(sdk.getSnapshots(repository.id)).resolves.toEqual({
      snapshots: expect.arrayContaining([
        expect.objectContaining({
          id: expect.any(String),
          time: expect.any(String),
        }),
      ]),
    });
  });

  it('deletes snapshot', async () => {
    const updateEvent = waitForMessage('RepositoryUpdate');

    const {
      snapshots: [{ id }],
    } = await sdk.getSnapshots(repository.id);

    await sdk.forgetSnapshot(repository.id, id);

    await expect(updateEvent).resolves.toEqual({
      type: 'RepositoryUpdate',
      repositoryId: repository.id,
      repository: expect.objectContaining({
        metrics: {
          lastBackup: expect.any(String),
          sizeBytes: expect.any(Number),
        },
      }),
    });
  });
});
