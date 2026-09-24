import * as sdk from '@futo-org/backups-orchestrator-ui/sdk';
import { parse } from 'cookie';
import { createEventSource, type EventSourceClient } from 'eventsource-client';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { io, Socket } from 'socket.io-client';
import { waitForLog } from 'src/victoria-logs';

const baseUrl = `http://localhost:22676`;
sdk.defaults.baseUrl = baseUrl;
let socket: Socket;

const startDeviceFlow = async (path = 'oidc/device') => {
  const events = createEventSource(`${baseUrl}/api/yucca/auth/${path}`);

  for await (const { data } of events) {
    const message = JSON.parse(data);
    if (message.type === 'START') {
      return { events, userCode: message.userCode as string, verificationUri: message.verificationUri as string };
    }
  }

  throw new Error('Device flow ended before it started');
};

const nextDeviceFlowEvent = async (events: EventSourceClient) => {
  for await (const { data } of events) {
    return JSON.parse(data);
  }

  throw new Error('Device flow ended without an event');
};

const approveDeviceCode = async (userCode: string, verificationUri: string, sub: string) => {
  const approveUrl = new URL('/api/form/device', verificationUri);
  approveUrl.searchParams.set('user_code', userCode);
  approveUrl.searchParams.set('sub', sub);

  const response = await fetch(approveUrl);
  if (!response.ok) {
    throw new Error(`Failed to approve device code: ${response.status} ${await response.text()}`);
  }
};

const login = async () => {
  const backendCreated = waitForMessage('BackendCreate');

  const { events, userCode, verificationUri } = await startDeviceFlow();
  await approveDeviceCode(userCode, verificationUri, 'bar');

  await backendCreated;
  events.close();
};

const completeSessionDeviceFlow = async (sub: string) => {
  const { events, userCode, verificationUri } = await startDeviceFlow('session/device');
  const result = nextDeviceFlowEvent(events);

  await approveDeviceCode(userCode, verificationUri, sub);

  try {
    return await result;
  } finally {
    events.close();
  }
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
      status: 'ready',
      hasTelemetry: 'none',
      requiresAuthentication: false,
      isAuthenticated: false,
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
    const { events, userCode, verificationUri } = await startDeviceFlow();
    events.close();

    expect(userCode).toEqual(expect.any(String));
    expect(verificationUri).toEqual(expect.any(String));
  });

  it('fails the session device flow before a backend is connected', async () => {
    const events = createEventSource(`${baseUrl}/api/yucca/auth/session/device`);

    await expect(nextDeviceFlowEvent(events)).resolves.toEqual({ type: 'FAILURE', reason: 'NOT_CONNECTED' });

    events.close();
  });

  it('should log us in using IdP', async () => {
    await login();
  }, 30_000);

  it('confirms the connected account through the session device flow', async () => {
    await expect(completeSessionDeviceFlow('bar')).resolves.toEqual({ type: 'SUCCESS' });
  }, 30_000);

  it('rejects a different account in the session device flow', async () => {
    await expect(completeSessionDeviceFlow('orchestration-api-intruder')).resolves.toEqual({
      type: 'FAILURE',
      reason: 'WRONG_ACCOUNT',
    });
  }, 30_000);

  it('rejects an invalid session token', async () => {
    await expect(sdk.createSession({ token: 'not-a-session-token' })).rejects.toMatchObject({ status: 401 });
  });

  it('returns 404 when creating a ticket for an unknown repository', async () => {
    await expect(sdk.createTicket({ action: 'repository.delete', repositoryId: randomUUID() })).rejects.toMatchObject({
      status: 404,
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

  it('defaults to the filesystem root when no path is provided', async () => {
    await expect(sdk.getFileListing()).resolves.toEqual(
      expect.objectContaining({
        path: sep,
        parent: sep,
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
      status: 'ready',
      hasTelemetry: 'none',
      requiresAuthentication: false,
      isAuthenticated: false,
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
      status: 'ready',
      hasTelemetry: 'none',
      requiresAuthentication: false,
      isAuthenticated: false,
      hasBackend: true,
      hasOnboardedKey: true,
      hasBackup: false,
      hasSchedule: false,
      hasSkippedExtraConfig: true,
    });
  });

  it('reports a bootstrap error to VictoriaLogs', async () => {
    const reportedAt = Date.now();

    await expect(sdk.reportError()).resolves.toEqual('');

    const record = await waitForLog(
      (entry: Record<string, unknown>) =>
        JSON.stringify(entry).includes('Bootstrap error') && Date.parse(String(entry._time)) >= reportedAt,
    );

    expect(JSON.stringify(record)).toContain('Bootstrap error');
  }, 60_000);
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

  it('reconfigures the primary backend of a repository', async () => {
    const { repository: moved } = await sdk.createRepository({ name: 'Moved Repository', worm: false });
    const { backend } = await sdk.createLocalBackend({ path: await mkdtemp(join(tmpdir(), 'reconfigure-')) });
    const primary = { id: backend.id, online: true, type: 'local' };

    const event = waitForMessage('RepositoryUpdate');

    await expect(sdk.reconfigureRepositoryPrimaryBackend(moved.id, { backendId: backend.id })).resolves.toEqual({
      repository: expect.objectContaining({
        id: moved.id,
        backends: { primary, secondary: [] },
      }),
    });

    await expect(event).resolves.toEqual({
      type: 'RepositoryUpdate',
      repositoryId: moved.id,
      repository: expect.objectContaining({ backends: { primary, secondary: [] } }),
    });

    await expect(sdk.getRepositories()).resolves.toEqual({
      repositories: expect.arrayContaining([
        expect.objectContaining({
          id: moved.id,
          backends: expect.objectContaining({ primary: expect.objectContaining({ id: backend.id }) }),
        }),
      ]),
    });
  });

  it('returns 404 when reconfiguring onto an unknown backend', async () => {
    await expect(
      sdk.reconfigureRepositoryPrimaryBackend(repository.id, { backendId: randomUUID() }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('returns 404 when reconfiguring an unknown repository', async () => {
    const { backend } = await sdk.createLocalBackend({ path: await mkdtemp(join(tmpdir(), 'reconfigure-')) });

    await expect(
      sdk.reconfigureRepositoryPrimaryBackend(randomUUID(), { backendId: backend.id }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('creates a ticket that redirects to the identity provider', async () => {
    const { redirectTo } = await sdk.createTicket({ action: 'repository.delete', repositoryId: repository.id });

    expect(Object.fromEntries(new URL(redirectTo).searchParams)).toEqual(
      expect.objectContaining({
        state: expect.any(String),
        prompt: 'login',
        max_age: '0',
      }),
    );
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
      status: 'ready',
      hasTelemetry: 'none',
      requiresAuthentication: false,
      isAuthenticated: false,
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
  }, 60_000);

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

  it('downloads a run log', async () => {
    const {
      runs: [{ id }],
    } = await sdk.getRunHistory(repository.id);

    const response = await fetch(`${baseUrl}/api/yucca/logs/${id}/download`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/^application\/jsonl/);
    expect(response.headers.get('content-disposition')).toBe(`attachment; filename="${id}.jsonl"`);

    const body = await response.text();
    const lines = body
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line));

    expect(lines).toEqual(expect.arrayContaining([expect.objectContaining({ message_type: 'summary' })]));
  });

  it('returns 404 when downloading the log of an unknown run', async () => {
    await expect(sdk.downloadRunLog('does-not-exist')).rejects.toMatchObject({ status: 404 });
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

  // The timeout covers a real restic backup racing four other suites under
  // `jest --maxWorkers=3` for one orchestration API; at 60s this hook was the
  // most frequent e2e failure in CI.
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
  }, 180_000);

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
      status: 'ready',
      hasTelemetry: 'none',
      requiresAuthentication: false,
      isAuthenticated: false,
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
  let backedUpScheduleNames: string[];

  beforeAll(async () => {
    const {
      repository: { id: restoreRepositoryId },
    } = await sdk.createRepository({
      name: 'My Restore',
      worm: false,
      paths: [resolve(homedir(), '.yucca')],
    });

    const event = waitForMessage('TaskEnd');
    await sdk.createBackup(restoreRepositoryId);
    await expect(event).resolves.toEqual({
      type: 'TaskEnd',
      parentId: restoreRepositoryId,
    });

    const { schedules } = await sdk.getSchedules();
    backedUpScheduleNames = schedules.map((schedule) => schedule.name);

    await sdk.resetOrchestrator();
    await login();
    await sdk.importRecoveryKey({ recoveryKey: '0'.repeat(64) });
    await sdk.confirmRecoveryKey();
  }, 60_000);

  it('inspects un-imported repositories', async () => {
    await expect(sdk.inspectRepositories()).resolves.toEqual({
      repositories: expect.arrayContaining([
        expect.objectContaining({
          id: expect.any(String),
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

  it('checks import repository', async () => {
    const { repositories } = await sdk.getRepositories();
    const [unimported] = repositories;

    await expect(sdk.checkImportRepository(unimported.id, unimported.backends!.primary.id)).resolves.toEqual({
      readable: true,
    });
  });

  it('reports a repository absent from a backend as unreadable', async () => {
    const { repositories } = await sdk.getRepositories();
    const [unimported] = repositories;
    const path = await mkdtemp(join(tmpdir(), 'empty-backend-'));
    const { backend } = await sdk.createLocalBackend({ path });

    await expect(sdk.checkImportRepository(unimported.id, backend.id)).resolves.toEqual({
      readable: false,
    });
  });

  it('imports a repository from backend', async () => {
    const { repositories } = await sdk.getRepositories();
    const unimported = repositories.find((repository) => repository.name !== 'My Restore')!;

    const event = waitForMessage('RepositoryCreate');
    const { repository } = await sdk.importRepository(unimported.id, unimported.backends!.primary.id);

    expect(repository.id).not.toEqual(unimported.id);
    expect(repository).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: unimported.name,
      }),
    );

    await expect(event).resolves.toEqual({
      type: 'RepositoryCreate',
      repository: expect.objectContaining({
        id: repository.id,
      }),
    });
  }, 30_000);

  it('restores point from repository', async () => {
    await expect(sdk.getSchedules()).resolves.toEqual(expect.objectContaining({ schedules: [] }));

    const { repositories } = await sdk.inspectRepositories();
    const restore = repositories.find((repository) => repository.name === 'My Restore')!;
    const [{ id: snapshotId }] = restore.snapshots!;

    const event = waitForMessage('TaskEnd');
    await sdk.restoreFromPoint(restore.id, snapshotId, restore.backends!.primary.id, {});

    await expect(event).resolves.toEqual({
      type: 'TaskEnd',
      parentId: restore.id,
    });

    const { schedules } = await sdk.getSchedules();
    expect(schedules.map((schedule) => schedule.name)).toEqual(expect.arrayContaining(backedUpScheduleNames));
  }, 45_000);
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
  }, 60_000);

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
          status: 'cancelled',
        }),
      ]),
    });
  }, 60_000);
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

  it('reports the immich backup status', async () => {
    const { immichIntegration } = await sdk.getIntegrations();

    await expect(sdk.getImmichBackupStatus()).resolves.toEqual(
      expect.objectContaining({
        integration: immichIntegration,
        repository: expect.objectContaining({ id: immichIntegration!.id }),
        backend: expect.objectContaining({ type: 'yucca' }),
        schedule: expect.objectContaining({ id: immichIntegration!.scheduleId }),
        databaseDump: { enabled: expect.any(Boolean), keepLastAmount: expect.any(Number) },
        databaseDumpWarningIgnored: false,
      }),
    );
  });

  it('configures the immich database dump', async () => {
    await sdk.configureImmichDatabaseDump({ enabled: false, keepLastAmount: 3 });

    await expect(sdk.getImmichBackupStatus()).resolves.toEqual(
      expect.objectContaining({ databaseDump: { enabled: false, keepLastAmount: 3 } }),
    );
  });

  it('rejects a database dump retention below one', async () => {
    await expect(sdk.configureImmichDatabaseDump({ keepLastAmount: 0 })).rejects.toMatchObject({ status: 400 });
  });

  it('ignores the database dump warning', async () => {
    await sdk.ignoreImmichDatabaseDumpWarning();

    await expect(sdk.getImmichBackupStatus()).resolves.toEqual(
      expect.objectContaining({ databaseDumpWarningIgnored: true }),
    );
  });

  it('starts an immich rollback and sets the maintenance token cookie', async () => {
    const { immichIntegration } = await sdk.getIntegrations();

    const response = await fetch(`${baseUrl}/api/yucca/integrations/immich/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repositoryId: immichIntegration!.id,
        snapshotId: 'rollback-snapshot',
        backupFileName: 'rollback.sql',
      }),
    });

    expect(response.status).toBe(201);
    expect(response.headers.getSetCookie().map((header) => parse(header))).toEqual([
      expect.objectContaining({
        immich_maintenance_token: `${immichIntegration!.id}:rollback-snapshot:rollback.sql`,
      }),
    ]);
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

describe('Telemetry', () => {
  let repository: sdk.LocalRepositoryDto;

  beforeAll(async () => {
    ({ repository } = await sdk.createRepository({
      name: 'Telemetry Repository',
      worm: false,
    }));

    const workingDir = await mkdtemp(join(tmpdir(), 'telemetry-'));
    await writeFile(join(workingDir, 'test-file'), 'hi');
    await sdk.updateRepository(repository.id, { paths: [workingDir] });

    await sdk.enableTelemetry();
  }, 30_000);

  it('ships a structured backup log to VictoriaLogs', async () => {
    const endEvent = waitForMessage('TaskEnd');

    await sdk.createBackup(repository.id);
    await endEvent;

    const record = await waitForLog((entry: Record<string, unknown>) => {
      const blob = JSON.stringify(entry);
      return blob.includes('Running backup') && blob.includes(repository.id);
    });

    const blob = JSON.stringify(record);
    expect(blob).toContain('Running backup');
    expect(blob).toContain(repository.id);
  }, 60_000);
});
