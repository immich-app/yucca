import { parseTopology, TopologyRepository } from 'src/repositories/topology.repository';

const validTopology = () => ({
  schema_version: 1,
  default_site: 'father',
  sites: [
    {
      code: 'father',
      display_name: 'Hetzner Falkenstein-1',
      description: 'Located in Falkenstein, Germany',
      rest_url: 'https://rest.htz-fsn1.backups.futo.cloud',
      default_cluster: 'father-spice',
      clusters: [
        {
          code: 'father-spice',
          display_name: 'Spice',
          active: true,
          rgw_admin_endpoint: 'https://s3.prod.fsn1.htz.futo.cloud',
        },
      ],
    },
  ],
});

describe('parseTopology', () => {
  it('parses a valid topology', () => {
    const topology = parseTopology(validTopology());
    expect(topology.default_site).toBe('father');
    expect(topology.sites[0].clusters[0].active).toBe(true);
  });

  it('applies defaults for optional fields', () => {
    const input = validTopology();
    delete (input.sites[0] as { description?: string }).description;
    expect(parseTopology(input).sites[0].description).toBe('');
  });

  it('rejects an unknown default_site', () => {
    expect(() => parseTopology({ ...validTopology(), default_site: 'nowhere' })).toThrow(/default_site/);
  });

  it('rejects a default_cluster not in the site', () => {
    const input = validTopology();
    input.sites[0].default_cluster = 'father-sietch';
    expect(() => parseTopology(input)).toThrow(/default_cluster/);
  });

  it('rejects duplicate site codes', () => {
    const input = validTopology();
    input.sites.push(structuredClone(input.sites[0]));
    expect(() => parseTopology(input)).toThrow(/Duplicate site code/);
  });

  it('rejects duplicate cluster codes within a site', () => {
    const input = validTopology();
    input.sites[0].clusters.push({ ...input.sites[0].clusters[0] });
    expect(() => parseTopology(input)).toThrow(/Duplicate cluster code/);
  });

  it('rejects a site without exactly one active cluster', () => {
    const none = validTopology();
    none.sites[0].clusters[0].active = false;
    expect(() => parseTopology(none)).toThrow(/exactly one active cluster/);

    const two = validTopology();
    two.sites[0].clusters.push({
      code: 'father-sietch',
      display_name: 'Sietch',
      active: true,
      rgw_admin_endpoint: 'https://s3.example.test',
    });
    two.sites[0].clusters[0].active = true;
    expect(() => parseTopology(two)).toThrow(/exactly one active cluster/);
  });

  it('requires globally unique, site-qualified cluster codes', () => {
    const unqualified = validTopology();
    unqualified.sites[0].clusters[0].code = 'spice';
    unqualified.sites[0].default_cluster = 'spice';
    expect(() => parseTopology(unqualified)).toThrow(/must start with its site code/);

    const duplicate = validTopology();
    duplicate.sites.push({
      ...structuredClone(duplicate.sites[0]),
      code: 'luke',
      display_name: 'Austin',
      default_cluster: 'father-spice',
    });
    expect(() => parseTopology(duplicate)).toThrow(/Duplicate fleet cluster code/);
  });

  it('rejects malformed codes', () => {
    const input = validTopology();
    input.sites[0].code = 'Not A Code';
    input.default_site = 'Not A Code';
    expect(() => parseTopology(input)).toThrow(/lowercase/);
  });

  it('rejects unknown fields so every topology consumer interprets the same document', () => {
    const input = { ...validTopology(), typo: true };
    expect(() => parseTopology(input)).toThrow(/Unrecognized key/);
  });
});

describe(TopologyRepository.name, () => {
  it('throws until a topology is loaded', () => {
    const repository = new TopologyRepository();
    expect(() => repository.get()).toThrow('Topology has not been loaded');

    repository.load(validTopology());
    expect(repository.get().default_site).toBe('father');
    expect(repository.getSite(null).code).toBe('father');
    expect(repository.getActiveCluster(repository.getSite('father')).code).toBe('father-spice');
  });

  it('keeps the previous topology when a load fails', () => {
    const repository = new TopologyRepository();
    repository.load(validTopology());

    expect(() => repository.load({ schema_version: 2 })).toThrow();
    expect(repository.get().default_site).toBe('father');
  });

  it('rejects unknown sites', () => {
    const repository = new TopologyRepository();
    repository.load(validTopology());

    expect(() => repository.getSite('nowhere')).toThrow("Unknown site 'nowhere'");
    expect(repository.hasSite('father')).toBe(true);
    expect(repository.hasCluster('father-spice')).toBe(true);
    expect(repository.hasCluster('luke-sietch')).toBe(false);
  });
});
