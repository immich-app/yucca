import { BadRequestException } from '@nestjs/common';
import { AuthDto } from 'src/dto/auth.dto';
import { RepositoryService } from 'src/services/repository.service';
import { Mocks, newMocks } from '../../test/mocks';

const auth = { id: 'b6b7c231-6dc0-4bdc-82c1-92677b1e6c1c', features: {} } as AuthDto;

const repoId = 'e2b47875-91a9-4c67-a3cd-fd6c0a5b6d11';

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
});
