import { YuccaWellKnown } from '../src/wellKnown';

const meta = {
  api_root: 'https://backups.futo.cloud/api',
  config: { restic_pack_size_mib: 16, connections_math: 'min(16, cores * 2)' },
  default_site: 'father',
  sites: [
    {
      code: 'father',
      display_name: 'Hetzner Falkenstein-1',
      description: 'Located in Falkenstein, Germany',
      rest_url: 'https://rest.htz-fsn1.backups.futo.cloud',
      default_cluster: 'father-spice',
      site_config: { restic_pack_size_mib: 64 },
      clusters: [
        {
          code: 'father-spice',
          display_name: 'Spice',
          cluster_config: { connections_math: '4' },
        },
      ],
    },
  ],
};

const jsonResponse = (body: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) }) as Response;

describe(YuccaWellKnown.name, () => {
  let sut: YuccaWellKnown;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    sut = new YuccaWellKnown();
    sut.configure('https://meta.example.test/.well-known/yucca.json');
    fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      if (String(url) === 'https://meta.example.test/.well-known/yucca.json') {
        return Promise.resolve(jsonResponse({ meta_url: 'https://backups.example.test/api/meta' }));
      }
      if (String(url) === 'https://backups.example.test/api/meta') {
        return Promise.resolve(jsonResponse(meta));
      }
      return Promise.reject(new Error(`Unexpected fetch: ${String(url)}`));
    });
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('follows the pointer to /meta and caches the result', async () => {
    await expect(sut.getBaseUrl()).resolves.toBe('https://backups.futo.cloud');
    await expect(sut.getSites()).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('merges site overrides over the global config', async () => {
    await expect(sut.getConfig()).resolves.toEqual({
      restic_pack_size_mib: 16,
      connections_math: 'min(16, cores * 2)',
    });
    await expect(sut.getConfig('father')).resolves.toEqual({
      restic_pack_size_mib: 64,
      connections_math: 'min(16, cores * 2)',
    });
    await expect(sut.getConfig('father', 'father-spice')).resolves.toEqual({
      restic_pack_size_mib: 64,
      connections_math: '4',
    });
  });

  it('evaluates connections_math with the given core count', async () => {
    await expect(sut.getConnections(4)).resolves.toBe(8);
    await expect(sut.getConnections(32)).resolves.toBe(16);
    await expect(sut.getPackSizeMib('father', 'father-spice')).resolves.toBe(64);
  });

  it('re-resolves after configure()', async () => {
    await sut.getBaseUrl();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    sut.configure('https://meta.example.test/.well-known/yucca.json');
    await sut.getBaseUrl();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('returns undefined helpers and throws get() when discovery is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));

    await expect(sut.get()).rejects.toThrow('offline');
    await expect(sut.getConnections(4)).resolves.toBeUndefined();
    await expect(sut.getPackSizeMib()).resolves.toBeUndefined();

    // The failure is memoized: no new fetch attempts within the failure TTL.
    const callsAfterFailure = fetchMock.mock.calls.length;
    await expect(sut.get()).rejects.toThrow('offline');
    expect(fetchMock.mock.calls.length).toBe(callsAfterFailure);
  });

  it('serves stale data when a refresh fails', async () => {
    await sut.getBaseUrl();

    sut['fetchedAt'] = 0;
    fetchMock.mockRejectedValue(new Error('offline'));

    await expect(sut.getBaseUrl()).resolves.toBe('https://backups.futo.cloud');
  });

  it('rejects a pointer without meta_url', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ nope: true }));
    await expect(sut.get()).rejects.toThrow();
  });

  it('rejects JSON error responses and malformed metadata without replacing stale data', async () => {
    await sut.getBaseUrl();
    sut['fetchedAt'] = 0;

    fetchMock.mockResolvedValue(jsonResponse({ error: 'unavailable' }, 503));
    await expect(sut.getBaseUrl()).resolves.toBe('https://backups.futo.cloud');

    sut['failedAt'] = 0;
    sut['lastError'] = undefined;
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ meta_url: 'https://backups.example.test/api/meta' }))
      .mockResolvedValueOnce(jsonResponse({ api_root: 123 }));
    await expect(sut.getBaseUrl()).resolves.toBe('https://backups.futo.cloud');
  });
});
