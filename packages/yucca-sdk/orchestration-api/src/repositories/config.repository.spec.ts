import { availableParallelism } from 'node:os';
import { yuccaWellKnown } from '../wellKnown';
import { ConfigRepository } from './config.repository';

describe(ConfigRepository.name, () => {
  const db = {
    selectFrom: jest.fn(() => ({
      where: jest.fn(() => ({
        select: jest.fn(() => ({
          executeTakeFirst: jest.fn().mockResolvedValue(),
        })),
      })),
    })),
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('resolves options for a placed repository', async () => {
    const connections = jest.spyOn(yuccaWellKnown, 'getConnections').mockResolvedValue(7);
    const packSize = jest.spyOn(yuccaWellKnown, 'getPackSizeMib').mockResolvedValue(64);
    const repository = new ConfigRepository(db as never);

    await expect(
      repository.getResticOptions({ siteCode: 'father', storageClusterCode: 'father-spice' }),
    ).resolves.toEqual({ connections: 7, packSizeMib: 64 });

    expect(connections).toHaveBeenCalledWith(availableParallelism(), 'father', 'father-spice');
    expect(packSize).toHaveBeenCalledWith('father', 'father-spice');
  });

  it('falls back to global config and core count without placement', async () => {
    const connections = jest.spyOn(yuccaWellKnown, 'getConnections').mockResolvedValue();
    const packSize = jest.spyOn(yuccaWellKnown, 'getPackSizeMib').mockResolvedValue();
    const repository = new ConfigRepository(db as never);

    await expect(repository.getResticOptions({ siteCode: null, storageClusterCode: null })).resolves.toEqual({
      connections: availableParallelism(),
      packSizeMib: undefined,
    });

    expect(connections).toHaveBeenCalledWith(availableParallelism(), undefined, undefined);
    expect(packSize).toHaveBeenCalledWith(undefined, undefined);
  });
});
