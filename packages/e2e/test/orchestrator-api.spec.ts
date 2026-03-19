import { createEventSource } from 'eventsource-client';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as sdk from 'orchestration-ui/sdk';
import { io, Socket } from 'socket.io-client';

const baseUrl = `http://localhost:22676`;
let socket: Socket;

beforeAll(async () => {
  await sdk.resetOrchestrator();

  socket = io(baseUrl, {
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

    await fetch(oidcHeaders.get('Location')!, {
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

describe('Onboarding', () => {
  it('reports backend is present', async () => {
    await expect(sdk.onboardingStatus()).resolves.toEqual({
      hasBackend: true,
      hasOnboardedKey: false,
    });
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

    const events = createEventSource(`${baseUrl}/api/logs/${logId}`);

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
        metrics: expect.objectContaining({
          lastBackup: expect.any(String),
          sizeBytes: expect.any(Number),
        }),
      }),
    });
  });
});

describe('Running Tasks', () => {
  it('works', async () => {
    await sdk.getRunningTasks();
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
  }, 10_000);

  it('creates and deletes a schedule', async () => {
    const createEvent = waitForMessage('ScheduleCreate');
    const deleteEvent = waitForMessage('ScheduleDelete');

    const { schedule } = await sdk.createSchedule({
      name: 'My Schedule',
      cron: '* * * * *',
      repositories: [],
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
    await sdk.removeRepositoryFromSchedule(schedule.id, repository.id);

    await expect(removeEvent).resolves.toEqual({
      type: 'ScheduleUpdate',
      scheduleId: schedule.id,
      schedule: expect.objectContaining({
        repositories: [repository2.id],
      }),
    });

    const addEvent = waitForMessage('ScheduleUpdate');
    await sdk.addRepositoryToSchedule(schedule.id, repository.id);

    await expect(addEvent).resolves.toEqual({
      type: 'ScheduleUpdate',
      scheduleId: schedule.id,
      schedule: expect.objectContaining({
        repositories: [repository2.id, repository.id],
      }),
    });
  });
});
