import * as sdk from '@futo-org/backups-orchestrator-ui/sdk';
import { createEventSource } from 'eventsource-client';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { io, Socket } from 'socket.io-client';

const baseUrl = `http://localhost:22676`;
let socket: Socket;

const login = async () => {
  const backendCreated = waitForMessage('BackendCreate');

  const { userCode, verificationUri } = await sdk.oidcDeviceFlow();

  const approveUrl = new URL('/api/form/device', verificationUri);
  approveUrl.searchParams.set('user_code', userCode);
  approveUrl.searchParams.set('sub', 'bar');

  const response = await fetch(approveUrl);
  if (!response.ok) {
    throw new Error(`Failed to approve device code: ${response.status} ${await response.text()}`);
  }

  await backendCreated;
};

beforeAll(async () => {
  await sdk.resetOrchestrator();

  socket = io(baseUrl, {
    path: '/api/yucca/socket.io',
    transports: ['websocket'],
  });
});

afterAll(() => {
  socket.close();
});

const waitForMessage = (type: string) => {
  return new Promise((resolve) => {
    const listener = (msg: string) => {
      const payload = JSON.parse(msg);
      if (payload.type !== type) {
        return;
      }

      resolve(payload);
      socket.offAny(listener);
    };

    socket.onAny(listener);
  });
};

describe('Onboarding (before setup)', () => {
  it('should report onboarding has not been performed', async () => {
    await expect(sdk.onboardingStatus()).resolves.toEqual({
      hasBackend: false,
      hasOnboardedKey: false,
      hasBackup: false,
      hasSchedule: false,
      hasSkippedExtraConfig: false,
    });
  });
});

describe('Auth', () => {
  it('provides an OIDC device flow code', async () => {
    await expect(sdk.oidcDeviceFlow()).resolves.toEqual({
      userCode: expect.any(String),
      verificationUri: expect.any(String),
    });
  });

  it('should log us in using IdP', async () => {
    await login();
  }, 30_000);
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
  it('lists a directory with files and subdirectories', async () => {
    const workingDir = await mkdtemp(join(tmpdir(), 'fs-'));
    await writeFile(join(workingDir, 'a-file'), 'hi');
    await mkdir(join(workingDir, 'a-dir'));

    await expect(sdk.getFileListing({ path: workingDir })).resolves.toEqual({
      parent: dirname(workingDir),
      path: workingDir,
      items: expect.arrayContaining([
        { path: join(workingDir, 'a-file'), isDirectory: false },
        { path: join(workingDir, 'a-dir'), isDirectory: true },
      ]),
    });
  });

  it('defaults to the home directory when no path is provided', async () => {
    await expect(sdk.getFileListing()).resolves.toEqual(
      expect.objectContaining({
        path: homedir(),
        parent: dirname(homedir()),
        items: expect.any(Array),
      }),
    );
  });
});

describe('Integrations', () => {
  it('gets integrations', async () => {
    await expect(sdk.getIntegrations()).resolves.toEqual(
      expect.not.objectContaining({
        immichIntegration: expect.anything(),
      }),
    );
  });
});

describe('Onboarding', () => {
  it('reports backend is present', async () => {
    await expect(sdk.onboardingStatus()).resolves.toEqual(
      expect.objectContaining({
        hasBackend: true,
        hasOnboardedKey: false,
      }),
    );
  });

  it('provides a randomly generated key', async () => {
    await expect(sdk.currentRecoveryKey()).resolves.toEqual({
      recoveryKey: expect.stringMatching(/[a-f0-9]{64}/),
    });
  });

  it('imports a provided key', async () => {
    const recoveryKey = '0'.repeat(64);

    await sdk.importRecoveryKey({
      recoveryKey,
    });

    await expect(sdk.currentRecoveryKey()).resolves.toEqual({ recoveryKey });
  });

  it('marks key as onboarded', async () => {
    await sdk.confirmRecoveryKey();

    await expect(sdk.onboardingStatus()).resolves.toEqual({
      hasBackend: true,
      hasOnboardedKey: true,
      hasBackup: false,
      hasSchedule: false,
      hasSkippedExtraConfig: false,
    });
  });

  it('skips extra config', async () => {
    await sdk.skipOnboardingExtraConfig();

    await expect(sdk.onboardingStatus()).resolves.toEqual({
      hasBackend: true,
      hasOnboardedKey: true,
      hasBackup: false,
      hasSchedule: false,
      hasSkippedExtraConfig: true,
    });
  });
});

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

  it('updates a repository and emits an event', async () => {
    const event = waitForMessage('RepositoryUpdate');

    await expect(sdk.updateRepository(repository.id, { name: 'Renamed Repository' })).resolves.toEqual({
      repository: expect.objectContaining({
        id: repository.id,
        name: 'Renamed Repository',
      }),
    });

    await expect(event).resolves.toEqual({
      type: 'RepositoryUpdate',
      repositoryId: repository.id,
      repository: expect.objectContaining({
        name: 'Renamed Repository',
      }),
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

    await expect(sdk.onboardingStatus()).resolves.toEqual({
      hasBackend: true,
      hasOnboardedKey: true,
      hasBackup: true,
      hasSchedule: false,
      hasSkippedExtraConfig: true,
    });
  });

  it('creates a backup', async () => {
    const workingDir = await mkdtemp(join(tmpdir(), 'test-'));
    await writeFile(join(workingDir, 'test-file'), 'hi');

    await sdk.updateRepository(repository.id, {
      paths: [workingDir],
    });

    const startEvent = waitForMessage('TaskStart');
    const endEvent = waitForMessage('TaskEnd');
    const updateEvent = waitForMessage('RepositoryUpdate');

    const { logId } = await sdk.createBackup(repository.id);

    const events = createEventSource(`${baseUrl}/api/yucca/logs/${logId}/stream`);

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
        metrics: expect.objectContaining({
          lastBackup: expect.any(String),
          sizeBytes: expect.any(Number),
        }),
      }),
    });
  }, 30_000);

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

  it('gets a single run by id', async () => {
    const {
      runs: [{ id }],
    } = await sdk.getRunHistory(repository.id);

    await expect(sdk.getRun(id)).resolves.toEqual({
      run: expect.objectContaining({
        id,
        repositoryId: repository.id,
        status: 'complete',
        type: 'backup',
      }),
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

  it('inspects repositories', async () => {
    await expect(sdk.inspectRepositories()).resolves.toEqual({
      repositories: expect.arrayContaining([
        expect.objectContaining({
          id: repository.id,
          snapshots: expect.arrayContaining([
            expect.objectContaining({
              id: expect.any(String),
              time: expect.any(String),
            }),
          ]),
        }),
      ]),
    });
  }, 20_000);

  it('lists snapshot contents', async () => {
    const {
      snapshots: [{ id }],
    } = await sdk.getSnapshots(repository.id);

    await expect(sdk.getSnapshotListing(repository.id, id)).resolves.toEqual({
      items: expect.any(Array),
      parent: '/',
      path: '/',
    });
  });

  it('restores a snapshot', async () => {
    const event = waitForMessage('TaskEnd');
    const {
      snapshots: [{ id }],
    } = await sdk.getSnapshots(repository.id);

    const { logId } = await sdk.restoreSnapshot(repository.id, id, {});

    expect(logId).toEqual(expect.any(String));

    await expect(event).resolves.toEqual({
      type: 'TaskEnd',
      parentId: repository.id,
    });
  });

  it('checks import repository', async () => {
    const { backends } = await sdk.getBackends();

    await expect(sdk.checkImportRepository(repository.id, backends[0].id)).resolves.toEqual({
      readable: true,
    });
  });

  it('reports a repository absent from a backend as unreadable', async () => {
    const path = await mkdtemp(join(tmpdir(), 'empty-backend-'));
    const { backend } = await sdk.createLocalBackend({ path });

    await expect(sdk.checkImportRepository(repository.id, backend.id)).resolves.toEqual({
      readable: false,
    });
  });

  it('restores from point', async () => {
    const event = waitForMessage('TaskEnd');
    const { backends } = await sdk.getBackends();
    const {
      snapshots: [{ id }],
    } = await sdk.getSnapshots(repository.id);

    const { logId } = await sdk.restoreFromPoint(repository.id, id, backends[0].id, {});

    expect(logId).toEqual(expect.any(String));

    await expect(event).resolves.toEqual({
      type: 'TaskEnd',
      parentId: repository.id,
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
        metrics: expect.objectContaining({
          lastBackup: expect.any(String),
          sizeBytes: expect.any(Number),
        }),
      }),
    });
  });
});

describe('Snapshot browsing and restore', () => {
  let repository: sdk.LocalRepositoryDto;
  let snapshotId: string;
  let workingDir: string;

  beforeAll(async () => {
    workingDir = await mkdtemp(join(tmpdir(), 'browse-'));
    await writeFile(join(workingDir, 'top-file'), 'top');
    await mkdir(join(workingDir, 'nested'));
    await writeFile(join(workingDir, 'nested', 'deep-file'), 'deep');

    ({ repository } = await sdk.createRepository({
      name: 'Browse Repository',
      worm: false,
      paths: [workingDir],
    }));

    const backupComplete = waitForMessage('TaskEnd');
    await sdk.createBackup(repository.id);
    await backupComplete;

    ({
      snapshots: [{ id: snapshotId }],
    } = await sdk.getSnapshots(repository.id));
  }, 30_000);

  it('navigates into a subdirectory of a snapshot', async () => {
    await expect(sdk.getSnapshotListing(repository.id, snapshotId, { path: workingDir })).resolves.toEqual({
      parent: dirname(workingDir),
      path: workingDir,
      items: expect.arrayContaining([
        { path: join(workingDir, 'top-file'), isDirectory: false },
        { path: join(workingDir, 'nested'), isDirectory: true },
      ]),
    });

    await expect(
      sdk.getSnapshotListing(repository.id, snapshotId, { path: join(workingDir, 'nested') }),
    ).resolves.toEqual({
      parent: workingDir,
      path: join(workingDir, 'nested'),
      items: [{ path: join(workingDir, 'nested', 'deep-file'), isDirectory: false }],
    });
  });

  it('restores a snapshot into a target directory with an include filter', async () => {
    const target = await mkdtemp(join(tmpdir(), 'restore-target-'));
    const event = waitForMessage('TaskEnd');

    const { logId } = await sdk.restoreSnapshot(repository.id, snapshotId, {
      target,
      include: [join(workingDir, 'nested', 'deep-file')],
    });

    expect(logId).toEqual(expect.any(String));

    await expect(event).resolves.toEqual({
      type: 'TaskEnd',
      parentId: repository.id,
    });

    await expect(readFile(join(target, workingDir, 'nested', 'deep-file'), 'utf8')).resolves.toEqual('deep');
    await expect(readFile(join(target, workingDir, 'top-file'), 'utf8')).rejects.toThrow();
  }, 30_000);
});

describe('Running Tasks', () => {
  it('returns the list of running tasks', async () => {
    await expect(sdk.getRunningTasks()).resolves.toEqual({
      tasks: expect.any(Array),
    });
  });
});

describe('Schedule', () => {
  let repository: sdk.LocalRepositoryDto;
  let repository2: sdk.LocalRepositoryDto;
  let schedule: sdk.ScheduleDto;

  beforeAll(async () => {
    ({ repository } = await sdk.createRepository({
      name: 'Test Repository',
      worm: false,
    }));

    ({ repository: repository2 } = await sdk.createRepository({
      name: 'Test Repository',
      worm: false,
    }));

    ({ schedule } = await sdk.createSchedule({
      name: 'Schedule',
      cron: '* * * * *',
      repositories: [repository.id, repository2.id],
    }));
  }, 30_000);

  it('creates and deletes a schedule', async () => {
    const createEvent = waitForMessage('ScheduleCreate');
    const deleteEvent = waitForMessage('ScheduleDelete');

    const { schedule } = await sdk.createSchedule({
      name: 'My Schedule',
      cron: '* * * * *',
      repositories: [],
    });

    await expect(sdk.onboardingStatus()).resolves.toEqual({
      hasBackend: true,
      hasOnboardedKey: true,
      hasBackup: true,
      hasSchedule: true,
      hasSkippedExtraConfig: true,
    });

    await expect(createEvent).resolves.toEqual({
      type: 'ScheduleCreate',
      schedule: expect.objectContaining({
        name: 'My Schedule',
      }),
    });

    await sdk.removeSchedule(schedule.id);

    await expect(deleteEvent).resolves.toEqual({
      type: 'ScheduleDelete',
      scheduleId: schedule.id,
    });
  });

  it('gets a list of schedules', async () => {
    await expect(sdk.getSchedules()).resolves.toEqual({
      schedules: expect.arrayContaining([
        expect.objectContaining({
          id: schedule.id,
        }),
      ]),
    });
  });

  it('updates schedule', async () => {
    const event = waitForMessage('ScheduleUpdate');

    await sdk.updateSchedule(schedule.id, {
      name: 'Updated Schedule',
      paused: true,
      repositories: [repository2.id, repository.id],
    });

    await expect(event).resolves.toEqual({
      type: 'ScheduleUpdate',
      scheduleId: schedule.id,
      schedule: expect.objectContaining({
        name: 'Updated Schedule',
        paused: true,
        repositories: [repository2.id, repository.id],
      }),
    });
  });

  it('removes and adds repository', async () => {
    const removeEvent = waitForMessage('ScheduleUpdate');
    await sdk.updateSchedule(schedule.id, { repositories: [repository2.id] });

    await expect(removeEvent).resolves.toEqual({
      type: 'ScheduleUpdate',
      scheduleId: schedule.id,
      schedule: expect.objectContaining({
        repositories: [repository2.id],
      }),
    });

    const addEvent = waitForMessage('ScheduleUpdate');
    await sdk.updateSchedule(schedule.id, {
      repositories: [repository2.id, repository.id],
    });

    await expect(addEvent).resolves.toEqual({
      type: 'ScheduleUpdate',
      scheduleId: schedule.id,
      schedule: expect.objectContaining({
        repositories: [repository2.id, repository.id],
      }),
    });
  });
});

describe('Reset & Restore', () => {
  let restoreRepositoryId: string;
  let restoreSnapshotId: string;

  let existingRepositoryId: string;
  let existingScheduleId: string;

  beforeAll(async () => {
    ({
      repositories: [{ id: existingRepositoryId }],
    } = await sdk.getRepositories());

    ({
      schedules: [{ id: existingScheduleId }],
    } = await sdk.getSchedules());

    ({
      repository: { id: restoreRepositoryId },
    } = await sdk.createRepository({
      name: 'My Restore',
      worm: false,
      paths: [resolve(homedir(), '.yucca')],
    }));

    const event = waitForMessage('TaskEnd');
    await sdk.createBackup(restoreRepositoryId);
    await expect(event).resolves.toEqual({
      type: 'TaskEnd',
      parentId: restoreRepositoryId,
    });

    ({
      snapshots: [{ id: restoreSnapshotId }],
    } = await sdk.getSnapshots(restoreRepositoryId));

    await sdk.resetOrchestrator();
    await login();
    await sdk.importRecoveryKey({ recoveryKey: '0'.repeat(64) });
    await sdk.confirmRecoveryKey();
  }, 60_000);

  it('imports a repository from backend', async () => {
    const { backends } = await sdk.getBackends();
    const event = waitForMessage('RepositoryCreate');

    const { repository } = await sdk.importRepository(existingRepositoryId, backends[0].id);

    expect(repository).toEqual(
      expect.objectContaining({
        id: existingRepositoryId,
        name: expect.any(String),
      }),
    );

    await expect(event).resolves.toEqual({
      type: 'RepositoryCreate',
      repository: expect.objectContaining({
        id: existingRepositoryId,
      }),
    });
  }, 30_000);

  it('restores point from repository', async () => {
    await expect(sdk.getSchedules()).resolves.toEqual(
      expect.objectContaining({
        schedules: expect.not.arrayContaining([
          expect.objectContaining({
            id: existingScheduleId,
          }),
        ]),
      }),
    );

    const event = waitForMessage('TaskEnd');
    const { backends } = await sdk.getBackends();

    await sdk.restoreFromPoint(restoreRepositoryId, restoreSnapshotId, backends[0].id, {});

    await expect(event).resolves.toEqual({
      type: 'TaskEnd',
      parentId: restoreRepositoryId,
    });

    await expect(sdk.getSchedules()).resolves.toEqual(
      expect.objectContaining({
        schedules: expect.arrayContaining([
          expect.objectContaining({
            id: existingScheduleId,
          }),
        ]),
      }),
    );
  }, 30_000);
});

describe('Repository deletion', () => {
  it('deletes a repository', async () => {
    const { repository } = await sdk.createRepository({
      name: 'Disposable Repository',
      worm: false,
    });

    const event = waitForMessage('RepositoryDelete');

    await sdk.deleteRepository(repository.id);

    await expect(event).resolves.toEqual({
      type: 'RepositoryDelete',
      repositoryId: repository.id,
    });

    const { repositories } = await sdk.getRepositories();
    const localRepositories = repositories.filter((repo) => repo.configuration !== undefined);

    expect(localRepositories).toEqual(expect.not.arrayContaining([expect.objectContaining({ id: repository.id })]));
  });
});

describe('Repository pruning', () => {
  let repository: sdk.LocalRepositoryDto;

  beforeAll(async () => {
    const workingDir = await mkdtemp(join(tmpdir(), 'prune-'));
    await writeFile(join(workingDir, 'test-file'), 'hi');

    ({ repository } = await sdk.createRepository({
      name: 'Prune Repository',
      worm: false,
      paths: [workingDir],
    }));

    await sdk.updateRepository(repository.id, {
      retentionPolicy: { keepLast: 1 },
    });

    const backupComplete = waitForMessage('TaskEnd');
    await sdk.createBackup(repository.id);
    await backupComplete;
  }, 30_000);

  it('prunes a repository according to its retention policy', async () => {
    const event = waitForMessage('TaskEnd');

    const { logId } = await sdk.pruneRepository(repository.id);

    expect(logId).toEqual(expect.any(String));

    await expect(event).resolves.toEqual({
      type: 'TaskEnd',
      parentId: repository.id,
    });
  }, 30_000);

  it('rejects pruning a repository without a retention policy', async () => {
    const { repository: unconfigured } = await sdk.createRepository({
      name: 'No Retention Repository',
      worm: false,
    });

    await sdk.updateRepository(unconfigured.id, { retentionPolicy: null });

    await expect(sdk.pruneRepository(unconfigured.id)).rejects.toMatchObject({ status: 400 });
  });
});

describe('Running task cancellation', () => {
  it('returns 404 when cancelling a task that is not running', async () => {
    await expect(sdk.cancelTask('does-not-exist')).rejects.toMatchObject({ status: 404 });
  });

  it('lists an in-progress backup and cancels it', async () => {
    const workingDir = await mkdtemp(join(tmpdir(), 'cancel-'));

    await writeFile(join(workingDir, 'payload'), randomBytes(64 * 1024 * 1024));

    const { repository } = await sdk.createRepository({
      name: 'Cancellable Repository',
      worm: false,
      paths: [workingDir],
    });

    const started = waitForMessage('TaskStart');
    const ended = waitForMessage('TaskEnd');

    const { logId } = await sdk.createBackup(repository.id);
    await started;

    await expect(sdk.getRunningTasks()).resolves.toEqual({
      tasks: expect.arrayContaining([
        expect.objectContaining({
          parentId: repository.id,
          type: 'backup',
          logId,
        }),
      ]),
    });

    await sdk.cancelTask(repository.id);

    await expect(ended).resolves.toEqual({
      type: 'TaskEnd',
      parentId: repository.id,
    });

    await expect(sdk.getRunHistory(repository.id)).resolves.toEqual({
      runs: expect.arrayContaining([
        expect.objectContaining({
          id: logId,
          status: 'failed',
        }),
      ]),
    });
  }, 30_000);
});

describe('Immich integration', () => {
  it('configures the immich integration', async () => {
    const event = waitForMessage('IntegrationUpdate');

    await sdk.configureImmichIntegration({
      name: 'Immich Backup',
      worm: false,
      cron: '* * * * *',
      dataFolders: ['upload'],
      backupConfiguration: false,
      libraries: 'all',
    });

    await expect(event).resolves.toEqual({
      type: 'IntegrationUpdate',
      integrations: expect.objectContaining({
        immichIntegration: expect.objectContaining({
          id: expect.any(String),
          scheduleId: expect.any(String),
          configuration: expect.objectContaining({
            backupConfiguration: false,
            libraries: 'all',
          }),
        }),
      }),
    });

    await expect(sdk.getIntegrations()).resolves.toEqual(
      expect.objectContaining({
        immichIntegration: expect.objectContaining({
          configuration: expect.objectContaining({ libraries: 'all' }),
        }),
      }),
    );
  });
});

describe('Local backend', () => {
  it('creates a local backend', async () => {
    const path = await mkdtemp(join(tmpdir(), 'backend-'));

    const event = waitForMessage('BackendCreate');

    const { backend } = await sdk.createLocalBackend({ path });

    expect(backend).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        type: 'local',
        isOnline: true,
      }),
    );

    await expect(event).resolves.toEqual({
      type: 'BackendCreate',
      backend: expect.objectContaining({ id: backend.id, type: 'local' }),
    });

    await expect(sdk.getBackends()).resolves.toEqual(
      expect.objectContaining({
        backends: expect.arrayContaining([expect.objectContaining({ id: backend.id, type: 'local' })]),
      }),
    );
  });
});
