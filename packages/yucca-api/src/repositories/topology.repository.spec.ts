import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from 'src/env';
import { TopologyRepository } from './topology.repository';

const topology = (siteCode: string, clusterCode: string) => ({
  schema_version: 1,
  default_site: siteCode,
  sites: [
    {
      code: siteCode,
      display_name: `${siteCode} display name`,
      description: '',
      rest_url: 'https://rest.example.test',
      default_cluster: clusterCode,
      clusters: [{ code: clusterCode, display_name: `${clusterCode} display name`, active: true }],
    },
  ],
});

describe(TopologyRepository.name, () => {
  const originalPath = env.TOPOLOGY_FILE;
  const directory = mkdtempSync(join(tmpdir(), 'yucca-topology-'));
  const path = join(directory, 'topology.json');

  beforeAll(() => {
    env.TOPOLOGY_FILE = path;
  });

  afterAll(() => {
    env.TOPOLOGY_FILE = originalPath;
    rmSync(directory, { recursive: true });
  });

  it('reloads valid projected-file updates without retaining an invalid update', () => {
    const repository = new TopologyRepository();
    writeFileSync(path, JSON.stringify(topology('local', 'local-dev')));
    expect(repository.get().default_site).toBe('local');

    const updated = JSON.stringify(topology('father', 'father-spice'));
    writeFileSync(path, updated);
    expect(repository.get().default_site).toBe('father');

    writeFileSync(path, '{"schema_version":');
    expect(() => repository.get()).toThrow('Invalid topology file');

    // The failed parse did not replace the last valid in-memory snapshot.
    writeFileSync(path, updated);
    expect(repository.get().default_site).toBe('father');
  });
});
