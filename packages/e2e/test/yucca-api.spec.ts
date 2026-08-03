import {
  AuthDto,
  createRepository,
  createResticUrl,
  getAuth,
  getRepositories,
  getRepository,
  listMetricsHistory,
  RepositoryWithMetricsDto,
  submitMetricBackupEnd,
  submitMetricBackupStart,
  submitMetricRepositorySize,
  updateRepository,
} from '@futo-org/backups-api-client';
import { init } from '@futo-org/restic-wrapper';
import { parse } from 'cookie';
import { env } from 'src/env';

const baseUrl = `http://localhost:${env.YUCCA_API_PORT}`;
const headers: Record<string, string> = {};
const authDto: AuthDto = {} as AuthDto;

const requestOpts = { baseUrl, headers };

describe('Auth', () => {
  it('should log us in using IdP', async () => {
    const { headers: loginHeaders } = await fetch(`${baseUrl}/api/auth/oidc/login`, {
      redirect: 'manual',
    });

    const redirectUrl = new URL(loginHeaders.get('Location')!);
    redirectUrl.pathname = '/api/form';
    redirectUrl.searchParams.set('sub', 'bar');

    const { headers: oidcHeaders } = await fetch(redirectUrl, {
      redirect: 'manual',
    });

    const { headers: callbackHeaders } = await fetch(oidcHeaders.get('Location'), {
      redirect: 'manual',
      headers: {
        Cookie: loginHeaders.getSetCookie().join('; '),
      },
    });

    const cookies = parse(callbackHeaders.getSetCookie().join('; '));
    expect(cookies['yucca-access-token']).toBeDefined();

    headers['Cookie'] = `yucca-access-token=${cookies['yucca-access-token']}`;
  });

  it('should give us user information', async () => {
    const auth = await getAuth(requestOpts);
    Object.assign(authDto, auth);

    expect(auth).toEqual(
      expect.objectContaining({
        id: expect.any(String),
      }),
    );
  });
});

describe('Repository', () => {
  let repository: RepositoryWithMetricsDto;

  beforeAll(async () => {
    ({ repository } = await createRepository(
      {
        name: 'Test Repository',
        worm: false,
      },
      requestOpts,
    ));
  });

  it('should list repositories', async () => {
    await expect(getRepositories(requestOpts)).resolves.toEqual({
      repositories: expect.arrayContaining([
        expect.objectContaining({
          id: repository.id,
        }),
      ]),
    });
  });

  it('should create a repository', async () => {
    await expect(
      createRepository(
        {
          name: 'My Repository',
          worm: false,
        },
        requestOpts,
      ),
    ).resolves.toEqual({
      repository: expect.objectContaining({
        name: 'My Repository',
        userId: authDto.id,
      }),
    });
  });

  it('should get a repository by id', async () => {
    await expect(getRepository(repository.id, requestOpts)).resolves.toEqual({
      repository: expect.objectContaining({
        id: repository.id,
        userId: authDto.id,
        name: 'Test Repository',
        worm: false,
        metrics: expect.any(Object),
      }),
    });
  });

  it('should update a repository name', async () => {
    await expect(updateRepository(repository.id, { name: 'Renamed Repository' }, requestOpts)).resolves.toEqual({
      repository: expect.objectContaining({
        id: repository.id,
        name: 'Renamed Repository',
      }),
    });
  });

  it('should generate usable URL for restic', async () => {
    const { url } = await createResticUrl(repository.id, {}, requestOpts);
    await init().repository(url).insecureNoPassword().run();
  });
});

describe('Metrics', () => {
  let repository: RepositoryWithMetricsDto;

  beforeAll(async () => {
    ({ repository } = await createRepository(
      {
        name: 'Metrics Repository',
        worm: false,
      },
      requestOpts,
    ));
  });

  it('should reflect submitted metric changes in history', async () => {
    await submitMetricBackupStart(repository.id, requestOpts);
    await submitMetricBackupEnd(repository.id, { success: true, durationMs: 1234 }, requestOpts);
    await submitMetricRepositorySize(repository.id, { sizeBytes: 4096 }, requestOpts);

    await expect(listMetricsHistory(repository.id, {}, requestOpts)).resolves.toEqual({
      items: expect.arrayContaining([
        expect.objectContaining({
          id: expect.any(String),
          repositoryId: repository.id,
          started: expect.any(String),
        }),
        expect.objectContaining({
          id: expect.any(String),
          repositoryId: repository.id,
          backup: expect.any(String),
          successfulBackup: expect.any(String),
          backupDuration: 1234,
        }),
        expect.objectContaining({
          id: expect.any(String),
          repositoryId: repository.id,
          sizeBytes: '4096',
        }),
      ]),
      nextCursor: null,
    });
  });

  it('should reflect submitted metric changes on the repository', async () => {
    await expect(getRepository(repository.id, requestOpts)).resolves.toEqual({
      repository: expect.objectContaining({
        id: repository.id,
        metrics: expect.objectContaining({
          sizeBytes: 4096,
          lastBackup: expect.any(String),
          lastSuccessfulBackup: expect.any(String),
          lastBackupDuration: 1234,
        }),
      }),
    });
  });

  it('should page through history with limit and cursor', async () => {
    const { repository: pagedRepository } = await createRepository(
      {
        name: 'Paged Metrics Repository',
        worm: false,
      },
      requestOpts,
    );

    for (const sizeBytes of [1024, 2048, 4096]) {
      await submitMetricRepositorySize(pagedRepository.id, { sizeBytes }, requestOpts);
    }

    const firstPage = await listMetricsHistory(pagedRepository.id, { limit: '2' }, requestOpts);
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    expect(firstPage.items.map((item) => item.sizeBytes)).toEqual(['4096', '2048']);

    const secondPage = await listMetricsHistory(
      pagedRepository.id,
      { limit: '2', cursor: firstPage.nextCursor! },
      requestOpts,
    );
    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.nextCursor).toBeNull();
    expect(secondPage.items.map((item) => item.sizeBytes)).toEqual(['1024']);
  });
});
