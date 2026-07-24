import { JwtService } from '@nestjs/jwt';
import { createPublicKey } from 'node:crypto';
import { env } from 'src/env';
import { RepositoryService } from './repository.service';

const newJwtService = () =>
  new JwtService({
    privateKey: env.JWT_PRIVATE_KEY,
    signOptions: { algorithm: 'ES256', expiresIn: env.JWT_EXPIRES_IN },
  });

const repositoryRow = {
  id: '00000000-0000-0000-0000-00000000000r',
  name: 'bench',
  worm: false,
  user: { id: '00000000-0000-0000-0000-00000000000u', name: 'u', email: 'u@x', disabled: false },
  metrics: { sizeBytes: 0, lastStarted: null, lastBackup: null, lastSuccessfulBackup: null, lastBackupDuration: null },
};

describe(RepositoryService.name, () => {
  let repositories: { [k: string]: jest.Mock };
  let users: { [k: string]: jest.Mock };
  let jwt: JwtService;
  let sut: RepositoryService;

  beforeEach(() => {
    repositories = { list: jest.fn(), get: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() };
    users = { getBySub: jest.fn(), create: jest.fn() };
    jwt = newJwtService();
    sut = new RepositoryService(repositories as never, users as never, jwt);
  });

  describe('create', () => {
    it('should use the given owner without touching users', async () => {
      repositories.create.mockResolvedValue(repositoryRow);

      await expect(sut.create({ name: 'bench', userId: repositoryRow.user.id })).resolves.toEqual({
        repository: repositoryRow,
      });
      expect(repositories.create).toHaveBeenCalledWith({
        name: 'bench',
        userId: repositoryRow.user.id,
        worm: false,
      });
      expect(users.getBySub).not.toHaveBeenCalled();
    });

    it('should fall back to the existing service user', async () => {
      users.getBySub.mockResolvedValue({ id: 'service-user-id' });
      repositories.create.mockResolvedValue(repositoryRow);

      await sut.create({ name: 'bench' });

      expect(users.getBySub).toHaveBeenCalledWith('yucca-admin-service');
      expect(users.create).not.toHaveBeenCalled();
      expect(repositories.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'service-user-id' }));
    });

    it('should create the service user on first use', async () => {
      users.getBySub.mockResolvedValue(null);
      users.create.mockResolvedValue({ id: 'new-service-user' });
      repositories.create.mockResolvedValue(repositoryRow);

      await sut.create({ name: 'bench', worm: true });

      expect(users.create).toHaveBeenCalledWith(expect.objectContaining({ sub: 'yucca-admin-service' }));
      expect(repositories.create).toHaveBeenCalledWith({ name: 'bench', userId: 'new-service-user', worm: true });
    });
  });

  describe('url', () => {
    // The parsed env may carry dev RESTIC_* values (mise env); pin both
    // states explicitly so the tests are environment-independent.
    type ResticEnv = { RESTIC_JWT_PRIVATE_KEY?: string; RESTIC_ENDPOINT?: string };
    const restic = env as ResticEnv;
    let saved: ResticEnv;

    beforeEach(() => {
      saved = { RESTIC_JWT_PRIVATE_KEY: restic.RESTIC_JWT_PRIVATE_KEY, RESTIC_ENDPOINT: restic.RESTIC_ENDPOINT };
    });

    afterEach(() => {
      restic.RESTIC_JWT_PRIVATE_KEY = saved.RESTIC_JWT_PRIVATE_KEY;
      restic.RESTIC_ENDPOINT = saved.RESTIC_ENDPOINT;
    });

    it('should 501 when restic signing is not configured', async () => {
      delete restic.RESTIC_JWT_PRIVATE_KEY;
      delete restic.RESTIC_ENDPOINT;

      await expect(sut.url(repositoryRow.id)).rejects.toThrowErrorMatchingInlineSnapshot(
        `"RESTIC_JWT_PRIVATE_KEY / RESTIC_ENDPOINT are not configured"`,
      );
    });

    it('should mint a rest: URL with verifiable claims', async () => {
      restic.RESTIC_JWT_PRIVATE_KEY = env.JWT_PRIVATE_KEY;
      restic.RESTIC_ENDPOINT = 'https://gw.example.net';
      repositories.get.mockResolvedValue(repositoryRow);

      const { url } = await sut.url(repositoryRow.id);
      expect(url.startsWith('rest:https://restic:')).toBe(true);

      const parsed = new URL(url.slice('rest:'.length));
      expect(parsed.pathname).toBe(`/${repositoryRow.id}`);

      const publicKey = createPublicKey(env.JWT_PRIVATE_KEY).export({ type: 'spki', format: 'pem' }).toString();
      const claims = jwt.verify(decodeURIComponent(parsed.password), { publicKey, algorithms: ['ES256'] });
      expect(claims).toMatchObject({
        user: repositoryRow.user.id,
        repository: repositoryRow.id,
        writeOnce: false,
      });
    });
  });
});
