import { MetaService } from 'src/services/meta.service';
import { Mocks, newMocks } from '../../test/mocks';

describe(MetaService.name, () => {
  let sut: MetaService;
  let mocks: Mocks;

  beforeEach(() => {
    mocks = newMocks();
    sut = new MetaService(mocks.topology as never, mocks.settings as never);

    mocks.topology.get.mockReturnValue({
      schema_version: 1,
      default_site: 'father',
      sites: [
        {
          code: 'father',
          display_name: 'Hetzner Falkenstein-1',
          description: 'Located in Falkenstein, Germany',
          rest_url: 'https://rest.htz-fsn1.backups.futo.cloud',
          default_cluster: 'father-spice',
          clusters: [{ code: 'father-spice', display_name: 'Spice', active: true }],
        },
      ],
    });
  });

  it('returns defaults when no settings exist', async () => {
    mocks.settings.getAll.mockResolvedValue({});

    await expect(sut.getMeta()).resolves.toEqual({
      api_root: 'http://localhost:3020/api',
      config: { restic_pack_size_mib: 16, connections_math: '16' },
      default_site: 'father',
      sites: [
        {
          code: 'father',
          display_name: 'Hetzner Falkenstein-1',
          description: 'Located in Falkenstein, Germany',
          rest_url: 'https://rest.htz-fsn1.backups.futo.cloud',
          default_cluster: 'father-spice',
          site_config: {},
          clusters: [{ code: 'father-spice', display_name: 'Spice', cluster_config: {} }],
        },
      ],
    });
  });

  it('merges global overrides and exposes site overrides verbatim', async () => {
    mocks.settings.getAll.mockResolvedValue({
      global: { restic_pack_size_mib: 32 },
      'site:father': { connections_math: 'min(16, cores * 2)' },
      'cluster:father-spice': { restic_pack_size_mib: 64 },
    });

    const meta = await sut.getMeta();
    expect(meta.config).toEqual({ restic_pack_size_mib: 32, connections_math: '16' });
    expect(meta.sites[0].site_config).toEqual({ connections_math: 'min(16, cores * 2)' });
    expect(meta.sites[0].clusters[0].cluster_config).toEqual({ restic_pack_size_mib: 64 });
  });
});
