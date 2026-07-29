import { env } from 'src/env';
import { TopologyRepository } from 'src/repositories/topology.repository';
import { TopologyService } from 'src/services/topology.service';

describe(TopologyService.name, () => {
  it('loads the topology file into the repository on init', async () => {
    const repository = new TopologyRepository();
    const storage = { readFile: jest.fn().mockResolvedValue(JSON.stringify({ schema_version: 1 })) };
    const load = jest.spyOn(repository, 'load').mockReturnValue({} as never);

    await new TopologyService(storage as never, repository).onModuleInit();

    expect(storage.readFile).toHaveBeenCalledWith(env.TOPOLOGY_FILE);
    expect(load).toHaveBeenCalledWith({ schema_version: 1 });
  });

  it('names the file in read and parse failures', async () => {
    const repository = new TopologyRepository();

    const unreadable = { readFile: jest.fn().mockRejectedValue(new Error('ENOENT')) };
    await expect(new TopologyService(unreadable as never, repository).onModuleInit()).rejects.toThrow(
      /Failed to read topology file '.*': ENOENT/,
    );

    const invalid = { readFile: jest.fn().mockResolvedValue('{"schema_version":') };
    await expect(new TopologyService(invalid as never, repository).onModuleInit()).rejects.toThrow(
      /Invalid topology file/,
    );
  });
});
