import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AuthDto } from 'src/dto/auth.dto';
import { TicketAction } from 'src/enum';
import { RepositoryService } from 'src/services/repository.service';
import { Mocks, newMocks } from '../../test/mocks';

const auth = { id: 'b6b7c231-6dc0-4bdc-82c1-92677b1e6c1c', features: {} } as AuthDto;

const repoId = 'e2b47875-91a9-4c67-a3cd-fd6c0a5b6d11';

const repository = {
  id: repoId,
  userId: auth.id,
  name: 'backup',
  worm: false,
  connectionId: 'conn',
  connectionType: 'immich',
  siteCode: 'father',
  storageClusterCode: 'father-spice',
  metrics: { sizeBytes: 42 },
};

const ticket = {
  id: 'ticket',
  token: 'token',
  oidcState: 'state',
  oidcCodeVerifier: 'verifier',
  userId: auth.id,
  repositoryId: repoId,
  action: TicketAction.DeleteRepository,
  validAt: new Date('2026-01-01T00:00:05Z'),
  expiresAt: new Date('2026-01-01T00:10:00Z'),
  consumedAt: new Date('2026-01-01T00:00:10Z'),
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

const site = {
  code: 'father',
  display_name: 'Hetzner Falkenstein-1',
  description: '',
  rest_url: 'https://rest.htz-fsn1.backups.futo.cloud',
  default_cluster: 'father-spice',
  clusters: [{ code: 'father-spice', display_name: 'Spice', active: true }],
};

describe(RepositoryService.name, () => {
  let sut: RepositoryService;
  let mocks: Mocks;

  beforeEach(() => {
    mocks = newMocks();
    sut = new RepositoryService(
      mocks.jwt as never,
      mocks.repository as never,
      mocks.wideContext as never,
      mocks.connection as never,
      mocks.topology as never,
    );
  });

  describe('create', () => {
    it('stamps the resolved site and its active cluster', async () => {
      mocks.topology.getSite.mockReturnValue(site);
      mocks.topology.getActiveCluster.mockReturnValue(site.clusters[0]);
      mocks.connection.getOrCreateDefault.mockResolvedValue({ id: 'conn', type: 'immich' } as never);
      mocks.repository.create.mockResolvedValue({ id: 'repo' } as never);

      await sut.create(auth, { name: 'backup', worm: false, site: 'father' });

      expect(mocks.topology.getSite).toHaveBeenCalledWith('father');
      expect(mocks.repository.create).toHaveBeenCalledWith({
        userId: auth.id,
        connectionId: 'conn',
        name: 'backup',
        worm: false,
        siteCode: 'father',
        storageClusterCode: 'father-spice',
      });
    });

    it('rejects an unknown site', async () => {
      mocks.topology.getSite.mockImplementation(() => {
        throw new BadRequestException("Unknown site 'nowhere'");
      });

      await expect(sut.create(auth, { name: 'backup', worm: false, site: 'nowhere' })).rejects.toThrow(
        BadRequestException,
      );
      expect(mocks.repository.create).not.toHaveBeenCalled();
    });
  });

  describe('createUrl', () => {
    it('mints a URL from the site rest_url with a storageCluster claim', async () => {
      mocks.repository.get.mockResolvedValue({
        id: repoId,
        userId: auth.id,
        worm: true,
        siteCode: 'father',
        storageClusterCode: 'father-spice',
        connectionId: 'conn',
        connectionType: 'immich',
      } as never);
      mocks.topology.getSite.mockReturnValue(site);
      mocks.jwt.signAsync.mockResolvedValue('signed-token');

      const { url } = await sut.createUrl(auth, repoId);

      expect(mocks.topology.getSite).toHaveBeenCalledWith('father');
      expect(mocks.jwt.signAsync).toHaveBeenCalledWith({
        user: auth.id,
        repository: repoId,
        writeOnce: true,
        storageCluster: 'father-spice',
        connection: 'immich',
      });
      expect(url).toBe(`rest:https://restic:signed-token@rest.htz-fsn1.backups.futo.cloud/${repoId}`);
    });
  });

  describe('update', () => {
    it('refuses to disable write-only through a plain update', async () => {
      mocks.repository.get.mockResolvedValue({ id: repoId, userId: auth.id, worm: true } as never);

      await expect(sut.update(auth, repoId, { worm: false })).rejects.toThrow(BadRequestException);
      expect(mocks.repository.update).not.toHaveBeenCalled();
    });
  });

  describe('disableWorm', () => {
    it('rejects a repository owned by someone else', async () => {
      mocks.repository.get.mockResolvedValue({ ...repository, userId: 'someone-else', worm: true } as never);

      await expect(sut.disableWorm(ticket, repoId)).rejects.toThrow(UnauthorizedException);
      expect(mocks.repository.disableWorm).not.toHaveBeenCalled();
    });

    it('rejects a repository that is not write-only', async () => {
      mocks.repository.get.mockResolvedValue({ ...repository, worm: false } as never);

      await expect(sut.disableWorm(ticket, repoId)).rejects.toThrow(BadRequestException);
      expect(mocks.repository.disableWorm).not.toHaveBeenCalled();
    });

    it('clears the worm flag and records who confirmed it', async () => {
      mocks.repository.get.mockResolvedValue({ ...repository, worm: true } as never);

      await sut.disableWorm(ticket, repoId);

      expect(mocks.repository.disableWorm).toHaveBeenCalledWith(repoId, {
        action: 'repository.disable-worm',
        userId: auth.id,
        detail: { ticket: { id: ticket.id, validAt: ticket.validAt }, repository: { ...repository, worm: true } },
      });
    });
  });

  describe('delete', () => {
    it('rejects a repository owned by someone else', async () => {
      mocks.repository.get.mockResolvedValue({ ...repository, userId: 'someone-else' } as never);

      await expect(sut.delete(ticket, repoId)).rejects.toThrow(UnauthorizedException);
      expect(mocks.repository.delete).not.toHaveBeenCalled();
    });

    it('deletes a write-only repository and records who confirmed it', async () => {
      mocks.repository.get.mockResolvedValue({ ...repository, worm: true } as never);

      await sut.delete(ticket, repoId);

      expect(mocks.repository.delete).toHaveBeenCalledWith(repoId, {
        action: 'repository.delete',
        userId: auth.id,
        detail: { ticket: { id: ticket.id, validAt: ticket.validAt }, repository: { ...repository, worm: true } },
      });
    });
  });
});
