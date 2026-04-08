import { init } from '@futo-org/restic-wrapper';
import { parse } from 'cookie';
import { env } from 'src/env';
import {
  AuthDto,
  createRepository,
  createResticUrl,
  getAuth,
  getRepositories,
  RepositoryWithMetricsDto,
} from 'yucca-api-client';

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

  it('should generate usable URL for restic', async () => {
    const { url } = await createResticUrl(repository.id, requestOpts);
    await init().repository(url).insecureNoPassword().run();
  });
});
