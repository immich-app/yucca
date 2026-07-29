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

  it('uses registered site and cluster overrides for authenticated restic URLs', async () => {
    const connections = jest.spyOn(yuccaWellKnown, 'getConnections').mockResolvedValue(7);
    const packSize = jest.spyOn(yuccaWellKnown, 'getPackSizeMib').mockResolvedValue(64);
    const repository = new ConfigRepository(db as never);
    repository.registerResticPlacement(
      'rest:https://short-lived-token@rest.example.test/repository-1',
      'father',
      'father-spice',
    );

    await expect(
      repository.getResticOptionRestConnections('rest:https://different-token@rest.example.test/repository-1'),
    ).resolves.toBe(7);
    await expect(
      repository.getResticPackSizeMib('rest:https://different-token@rest.example.test/repository-1'),
    ).resolves.toBe(64);

    expect(connections).toHaveBeenCalledWith(availableParallelism(), 'father', 'father-spice');
    expect(packSize).toHaveBeenCalledWith('father', 'father-spice');
  });

  it('does not assign cloud placement to local repositories', async () => {
    const connections = jest.spyOn(yuccaWellKnown, 'getConnections').mockResolvedValue();
    const repository = new ConfigRepository(db as never);
    repository.registerResticPlacement('/srv/backups/repository-1', null, null);

    await repository.getResticOptionRestConnections('/srv/backups/repository-1');

    expect(connections).toHaveBeenCalledWith(availableParallelism());
  });
});
