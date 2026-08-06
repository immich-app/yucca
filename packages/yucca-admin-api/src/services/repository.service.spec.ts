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
  siteCode: 'local',
  storageClusterCode: 'local-dev',
  connectionId: '00000000-0000-0000-0000-00000000000c',
  connectionType: 'restic',
  user: { id: '00000000-0000-0000-0000-00000000000u', name: 'u', email: 'u@x', disabled: false },
  metrics: { sizeBytes: 0, lastStarted: null, lastBackup: null, lastSuccessfulBackup: null, lastBackupDuration: null },
};

const site = {
  code: 'local',
  display_name: 'Local development',
  description: '',
  rest_url: 'https://gw.example.net',
  default_cluster: 'local-dev',
  clusters: [{ code: 'local-dev', display_name: 'Local development storage', active: true }],
};

describe(RepositoryService.name, () => {
  let repositories: { [k: string]: jest.Mock };
  let users: { [k: string]: jest.Mock };
  let topology: { [k: string]: jest.Mock };
  let connections: { [k: string]: jest.Mock };
  let jwt: JwtService;
  let sut: RepositoryService;

  beforeEach(() => {
    repositories = { list: jest.fn(), get: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() };
    users = { getBySub: jest.fn(), create: jest.fn() };
    topology = {
      getSite: jest.fn().mockReturnValue(site),
      getActiveCluster: jest.fn().mockReturnValue(site.clusters[0]),
      hasSite: jest.fn(),
      hasCluster: jest.fn(),
    };
    connections = { getByUser: jest.fn(), getOrCreateByType: jest.fn().mockResolvedValue({ id: 'connection-id' }) };
    jwt = newJwtService();
    sut = new RepositoryService(repositories as never, users as never, connections as never, jwt, topology as never);
  });

  describe('create', () => {
    it('should use the given owner without touching users', async () => {
      repositories.create.mockResolvedValue(repositoryRow);

      await expect(sut.create({ name: 'bench', userId: repositoryRow.user.id })).resolves.toEqual({
        repository: repositoryRow,
      });
      expect(connections.getOrCreateByType).toHaveBeenCalledWith(repositoryRow.user.id, 'restic', 'Manual restic');
      expect(repositories.create).toHaveBeenCalledWith({
        name: 'bench',
        userId: repositoryRow.user.id,
        connectionId: 'connection-id',
        worm: false,
        siteCode: 'local',
        storageClusterCode: 'local-dev',
      });
      expect(users.getBySub).not.toHaveBeenCalled();
    });

    it('should fall back to the existing service user', async () => {
      users.getBySub.mockResolvedValue({ id: 'service-user-id' });
      repositories.create.mockResolvedValue(repositoryRow);

      await sut.create({ name: 'bench' });

      expect(users.getBySub).toHaveBeenCalledWith('yucca-admin-service');
      expect(users.create).not.toHaveBeenCalled();
      expect(connections.getOrCreateByType).toHaveBeenCalledWith('service-user-id', 'restic', 'admin');
      expect(repositories.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'service-user-id' }));
    });

    it('should create the service user on first use', async () => {
      users.getBySub.mockResolvedValue(null);
      users.create.mockResolvedValue({ id: 'new-service-user' });
      repositories.create.mockResolvedValue(repositoryRow);

      await sut.create({ name: 'bench', worm: true });

      expect(users.create).toHaveBeenCalledWith(expect.objectContaining({ sub: 'yucca-admin-service' }));
      expect(repositories.create).toHaveBeenCalledWith({
        name: 'bench',
        userId: 'new-service-user',
        connectionId: 'connection-id',
        worm: true,
        siteCode: 'local',
        storageClusterCode: 'local-dev',
      });
    });
  });

  describe('url', () => {
    // The parsed env may carry dev RESTIC_* values (mise env); pin both states so tests are environment-independent.
    type ResticEnv = { RESTIC_JWT_PRIVATE_KEY?: string };
    const restic = env as ResticEnv;
    let saved: ResticEnv;

    beforeEach(() => {
      saved = { RESTIC_JWT_PRIVATE_KEY: restic.RESTIC_JWT_PRIVATE_KEY };
    });

    afterEach(() => {
      restic.RESTIC_JWT_PRIVATE_KEY = saved.RESTIC_JWT_PRIVATE_KEY;
    });

    it('should 501 when restic signing is not configured', async () => {
      delete restic.RESTIC_JWT_PRIVATE_KEY;

      await expect(sut.url(repositoryRow.id)).rejects.toThrowErrorMatchingInlineSnapshot(
        `"RESTIC_JWT_PRIVATE_KEY is not configured"`,
      );
    });

    it('should mint a rest: URL from the site rest_url with verifiable claims', async () => {
      restic.RESTIC_JWT_PRIVATE_KEY = env.JWT_PRIVATE_KEY;
      repositories.get.mockResolvedValue(repositoryRow);

      const { url } = await sut.url(repositoryRow.id);
      expect(url.startsWith('rest:https://restic:')).toBe(true);

      const parsed = new URL(url.slice('rest:'.length));
      expect(parsed.host).toBe('gw.example.net');
      expect(parsed.pathname).toBe(`/${repositoryRow.id}`);
      expect(topology.getSite).toHaveBeenCalledWith('local');

      const publicKey = createPublicKey(env.JWT_PRIVATE_KEY).export({ type: 'spki', format: 'pem' }).toString();
      const claims = jwt.verify(decodeURIComponent(parsed.password), { publicKey, algorithms: ['ES256'] });
      expect(claims).toMatchObject({
        user: repositoryRow.user.id,
        repository: repositoryRow.id,
        writeOnce: false,
        storageCluster: 'local-dev',
        connection: repositoryRow.connectionType,
      });
    });

    it('should use the stamped cluster code when present', async () => {
      restic.RESTIC_JWT_PRIVATE_KEY = env.JWT_PRIVATE_KEY;
      repositories.get.mockResolvedValue({ ...repositoryRow, storageClusterCode: 'local-spice' });

      const { url } = await sut.url(repositoryRow.id);

      const parsed = new URL(url.slice('rest:'.length));
      const publicKey = createPublicKey(env.JWT_PRIVATE_KEY).export({ type: 'spki', format: 'pem' }).toString();
      const claims = jwt.verify(decodeURIComponent(parsed.password), { publicKey, algorithms: ['ES256'] });
      expect(claims).toMatchObject({ storageCluster: 'local-spice' });
      expect(topology.getSite).toHaveBeenCalledWith('local');
    });
  });
});
